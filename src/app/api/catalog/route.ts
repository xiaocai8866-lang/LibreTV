import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { cmsRequestHeaders, filterAdultResults, isAdultContent, parseSearchList } from '@/lib/cms-parser';
import { getEnvSources } from '@/lib/env-sources';
import { fetchUpstream, getCache, setCache } from '@/lib/fetch-utils';
import type { SourceConfig } from '@/lib/types';

export const runtime = 'nodejs';

/** 片库（首页分类浏览）：按分类翻页列出主源的全部影片 */
const CATALOG_CACHE_TTL = 5 * 60 * 1000;
const CLASS_CACHE_TTL = 6 * 60 * 60 * 1000;
/** 预告片、解说、成人类目不进片库 */
const EXCLUDED_CLASS = /预告|解说|理论|福利|伦理/;

/**
 * 主源：CATALOG_SOURCE（预置源名称）> 名称含「暴风」的预置源 > 第一个预置源。
 * 返回的 key 与 DEFAULT_SOURCES 一致，详情弹窗能直接解析到同一个源。
 */
function catalogSource(): SourceConfig | undefined {
  const envs = getEnvSources();
  const wanted = process.env.CATALOG_SOURCE?.trim();
  return (
    (wanted && envs.find((s) => s.name === wanted)) ||
    envs.find((s) => s.name.includes('暴风')) ||
    envs[0]
  );
}

export interface CatalogClass {
  id: string;
  name: string;
  pid: string;
}

export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const source = catalogSource();
  if (!source) return NextResponse.json({ error: '未配置预置点播源' }, { status: 404 });
  const base = source.url.replace(/\/+$/, '');
  const sp = new URL(req.url).searchParams;

  try {
    if (sp.get('ac') === 'class') {
      const key = `catalog:class:${base}`;
      let classes = getCache<CatalogClass[]>(key);
      if (!classes) {
        const res = await fetchUpstream(`${base}?ac=list`, { timeoutMs: 8000, headers: cmsRequestHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { class?: { type_id: unknown; type_name: unknown; type_pid?: unknown }[] };
        classes = (data.class ?? [])
          .map((c) => ({ id: String(c.type_id), name: String(c.type_name), pid: String(c.type_pid ?? '0') }))
          .filter((c) => !EXCLUDED_CLASS.test(c.name) && !isAdultContent(c.name));
        setCache(key, classes, CLASS_CACHE_TTL);
      }
      return NextResponse.json({ source: { key: source.key, name: source.name, url: source.url }, classes });
    }

    const t = (sp.get('t') || '').replace(/\D/g, '');
    const pg = Math.min(1000, Math.max(1, parseInt(sp.get('pg') || '1', 10) || 1));
    const h = (sp.get('h') || '').replace(/\D/g, '');
    const year = (sp.get('year') || '').replace(/\D/g, '').slice(0, 4);
    // 源站每页固定 20 条：size 取 20 的倍数（最多 60），一页由多个源站页拼成
    const per = Math.min(3, Math.max(1, Math.round((parseInt(sp.get('size') || '20', 10) || 20) / 20)));
    const key = `catalog:${base}:${t}:${pg}:${h}:${year}:${per}`;
    const cached = getCache<unknown>(key);
    if (cached) return NextResponse.json(cached);

    const fetchPage = async (page: number) => {
      const qs = new URLSearchParams({ ac: 'videolist', pg: String(page) });
      if (t) qs.set('t', t);
      if (h) qs.set('h', h);
      if (year) qs.set('year', year);
      const res = await fetchUpstream(`${base}?${qs}`, { timeoutMs: 8000, headers: cmsRequestHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { total?: unknown };
    };
    const first = (pg - 1) * per + 1;
    const pages = await Promise.all(
      Array.from({ length: per }, (_, i) => fetchPage(first + i).catch((err) => (i === 0 ? Promise.reject(err) : null)))
    );
    const total = parseInt(String(pages[0]?.total ?? '0'), 10) || 0;
    const list = pages
      .flatMap((data) => (data ? parseSearchList(data, source) : []))
      .filter((item) => !EXCLUDED_CLASS.test(item.typeName || ''));
    const payload = {
      list: filterAdultResults(list, true),
      page: pg,
      pagecount: Math.max(1, Math.ceil(total / (per * 20))),
      total,
    };
    setCache(key, payload, CATALOG_CACHE_TTL);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '片库加载失败' }, { status: 502 });
  }
}
