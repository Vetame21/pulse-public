// The part of the Supabase query builder that Pulse uses, turned into SQL for the
// demo database. It returns what Supabase returns ({ data, error, count }), so the
// app's data code runs unchanged. Results come out of Postgres as JSON, like
// PostgREST does, so dates, bigints and arrays look exactly as they do in production.
// Anything Pulse doesn't use throws, so a gap shows up at once in demo mode.

type Row = Record<string, unknown>;
/** Runs one statement as the current user; returns its rows. */
export type Exec = (sql: string, params: unknown[]) => Promise<Row[]>;
export type DbError = { message: string; code: string; details: string | null; hint: string | null };
export type Result = { data: any; error: DbError | null; count: number | null }; // eslint-disable-line @typescript-eslint/no-explicit-any

const IDENT = /^[a-z_][a-z0-9_]*$/;
export function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Demo database: unsupported name "${name}"`);
  return `"${name}"`;
}

/** Parameters go to Postgres as text (or JSON); Postgres casts them to the column's type. */
function param(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function toDbError(error: unknown): DbError {
  const e = error as { message?: string; code?: string; detail?: string; hint?: string };
  return { message: e.message ?? String(error), code: e.code ?? "", details: e.detail ?? null, hint: e.hint ?? null };
}

const OPS: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };

/** Split "a,b,and(c,d)" at top-level commas. */
function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "," && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** PostgREST's or()/and() filter text, e.g. "end_date.gte.2026-10-01,and(end_date.is.null,date.gte.2026-10-01)". */
export function logicToSql(expr: string, joiner: "or" | "and", col: (c: string) => string, p: (v: unknown) => string): string {
  const items = splitTop(expr).map((item) => {
    const group = /^(and|or)\((.*)\)$/.exec(item);
    if (group) return `(${logicToSql(group[2], group[1] as "and" | "or", col, p)})`;
    const [c, op, ...rest] = item.split(".");
    const value = rest.join(".");
    if (op === "is") return `${col(c)} is ${isValue(value)}`;
    if (!OPS[op]) throw new Error(`Demo database: unsupported filter "${op}"`);
    return `${col(c)} ${OPS[op]} ${p(value)}`;
  });
  return items.join(` ${joiner} `);
}

function isValue(v: unknown): string {
  if (v === null || v === "null") return "null";
  if (v === true || v === "true") return "true";
  if (v === false || v === "false") return "false";
  throw new Error(`Demo database: unsupported is() value "${String(v)}"`);
}

export class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private columns = "*";
  private returning: string | null = null;
  private headCount = false;
  private values: Row | Row[] = {};
  private conflict: { columns: string; ignore: boolean } | null = null;
  private filters: string[] = [];
  private params: unknown[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;
  private offsetN = 0;
  private one: "single" | "maybe" | null = null;

  constructor(
    private table: string,
    private exec: Exec,
  ) {
    ident(table);
  }

  private p = (value: unknown) => `$${this.params.push(param(value))}`;
  private col = (name: string) => `x.${ident(name)}`;
  private list(columns: string): string {
    return columns.trim() === "*" ? "x.*" : columns.split(",").map((c) => this.col(c.trim())).join(", ");
  }

  select(columns = "*", options?: { head?: boolean; count?: "exact" }) {
    if (this.op === "select") {
      this.columns = columns;
      this.headCount = Boolean(options?.head);
    } else {
      this.returning = columns;
    }
    return this;
  }
  insert(values: Row | Row[]) {
    this.op = "insert";
    this.values = values;
    return this;
  }
  upsert(values: Row | Row[], options: { onConflict: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.values = values;
    this.conflict = { columns: options.onConflict, ignore: Boolean(options.ignoreDuplicates) };
    return this;
  }
  update(values: Row) {
    this.op = "update";
    this.values = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  private where(sql: string) {
    this.filters.push(sql);
    return this;
  }
  eq(c: string, v: unknown) { return this.where(`${this.col(c)} = ${this.p(v)}`); }
  neq(c: string, v: unknown) { return this.where(`${this.col(c)} <> ${this.p(v)}`); }
  gt(c: string, v: unknown) { return this.where(`${this.col(c)} > ${this.p(v)}`); }
  gte(c: string, v: unknown) { return this.where(`${this.col(c)} >= ${this.p(v)}`); }
  lt(c: string, v: unknown) { return this.where(`${this.col(c)} < ${this.p(v)}`); }
  lte(c: string, v: unknown) { return this.where(`${this.col(c)} <= ${this.p(v)}`); }
  ilike(c: string, v: string) { return this.where(`${this.col(c)} ilike ${this.p(v)}`); }
  is(c: string, v: null | boolean) { return this.where(`${this.col(c)} is ${isValue(v)}`); }
  in(c: string, values: unknown[]) {
    return this.where(`${this.col(c)}::text in (select jsonb_array_elements_text(${this.p(values.map(param))}::jsonb))`);
  }
  or(expr: string) { return this.where(`(${logicToSql(expr, "or", this.col, this.p)})`); }

  order(c: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const dir = options.ascending === false ? "desc" : "asc";
    const nulls = options.nullsFirst === undefined ? "" : options.nullsFirst ? " nulls first" : " nulls last";
    this.orders.push(`${this.col(c)} ${dir}${nulls}`);
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }
  /** Type-only in Supabase (narrows the row type); nothing to do here. */
  returns() {
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }

  private whereSql() {
    return this.filters.length ? ` where ${this.filters.join(" and ")}` : "";
  }

  /** The SQL and parameters this query runs (public for tests). */
  toSql(): { sql: string; params: unknown[] } {
    const t = `public.${ident(this.table)}`;
    const json = (inner: string) => `select coalesce(json_agg(q), '[]'::json) as data from (${inner}) q`;
    const ret = this.returning === null ? "" : ` returning ${this.list(this.returning)}`;
    const wrap = (stmt: string) => (this.returning === null ? stmt : `with q as (${stmt}) select coalesce(json_agg(q), '[]'::json) as data from q`);

    if (this.op === "select") {
      if (this.headCount) return { sql: `select count(*)::int as count from ${t} as x${this.whereSql()}`, params: this.params };
      const order = this.orders.length ? ` order by ${this.orders.join(", ")}` : "";
      const limit = this.limitN === null ? "" : ` limit ${this.limitN}`;
      const offset = this.offsetN ? ` offset ${this.offsetN}` : "";
      return { sql: json(`select ${this.list(this.columns)} from ${t} as x${this.whereSql()}${order}${limit}${offset}`), params: this.params };
    }
    if (this.op === "delete") return { sql: wrap(`delete from ${t} as x${this.whereSql()}${ret}`), params: this.params };

    const rows = Array.isArray(this.values) ? this.values : [this.values];
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    if (keys.length === 0) throw new Error("Demo database: nothing to write");
    const cols = keys.map(ident).join(", ");
    const data = this.p(rows);

    if (this.op === "update") {
      const sets = keys.map((k) => `${ident(k)} = r.${ident(k)}`).join(", ");
      return {
        sql: wrap(`update ${t} as x set ${sets} from jsonb_populate_record(null::${t}, (${data}::jsonb)->0) r${this.whereSql()}${ret}`),
        params: this.params,
      };
    }
    let conflict = "";
    if (this.conflict) {
      const target = this.conflict.columns.split(",").map((c) => ident(c.trim()));
      const updates = keys.filter((k) => !target.includes(ident(k))).map((k) => `${ident(k)} = excluded.${ident(k)}`);
      conflict = this.conflict.ignore || updates.length === 0
        ? ` on conflict (${target.join(", ")}) do nothing`
        : ` on conflict (${target.join(", ")}) do update set ${updates.join(", ")}`;
    }
    return {
      sql: wrap(`insert into ${t} as x (${cols}) select ${cols} from jsonb_populate_recordset(null::${t}, ${data}::jsonb)${conflict}${ret}`),
      params: this.params,
    };
  }

  private async run(): Promise<Result> {
    try {
      const { sql, params } = this.toSql();
      const rows = await this.exec(sql, params);
      if (this.headCount) return { data: null, error: null, count: Number(rows[0]?.count ?? 0) };
      if (this.op !== "select" && this.returning === null) return { data: null, error: null, count: null };
      const data = (rows[0]?.data ?? []) as Row[];
      if (!this.one) return { data, error: null, count: null };
      if (data.length > 1 || (this.one === "single" && data.length === 0)) {
        return {
          data: null,
          error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116", details: `${data.length} rows`, hint: null },
          count: null,
        };
      }
      return { data: data[0] ?? null, error: null, count: null };
    } catch (error) {
      return { data: null, error: toDbError(error), count: null };
    }
  }

  then<A = Result, B = never>(onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }
}

/** supabase.rpc(name, args): calls the database function with named arguments. */
export async function rpc(exec: Exec, name: string, args: Record<string, unknown> = {}): Promise<Result> {
  try {
    const params: unknown[] = [];
    const named = Object.entries(args).map(([k, v]) => `${ident(k)} => $${params.push(param(v))}`).join(", ");
    const call = `public.${ident(name)}(${named})`;
    const [{ type }] = await exec(
      `select p.prorettype::regtype::text as type from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`,
      [name],
    );
    if (type === "void") {
      await exec(`select ${call}`, params);
      return { data: null, error: null, count: null };
    }
    const rows = await exec(`select to_json(${call}) as data`, params);
    return { data: rows[0]?.data ?? null, error: null, count: null };
  } catch (error) {
    return { data: null, error: toDbError(error), count: null };
  }
}
