'use client';

import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { DoubanItem, SearchResultItem } from '@/lib/types';
import { DoubanCard } from './video-card';
import { SmartImage } from './smart-image';
import { Icon } from './icon';

/**
 * 门户式首页（仿主流影视站布局）。
 * - 片库：主源（/api/catalog，默认暴风）的分类树与分页列表，点海报直接打开详情选集；
 * - 推荐：豆瓣热门做轮播、热搜与榜单，点击按片名搜索。
 */
type Kind = 'movie' | 'tv';
interface CatalogClass { id: string; name: string; pid: string }
interface Handlers { onPick: (title: string) => void; onOpen: (item: SearchResultItem) => void }

/** 顶部分类：主源一级分类改成更口语的名字 */
const TOP_LABELS: Record<string, string> = {
  电影片: '电影', 连续剧: '电视剧', 动漫片: '动漫', 综艺片: '综艺', 短剧大全: '短剧', 体育赛事: '体育',
};
const TOP_ORDER = ['电影片', '连续剧', '动漫片', '综艺片', '短剧大全', '体育赛事'];

/** 首页片库分区：按分类名匹配主源的分类 id；今日更新用 h=24 */
const CATALOG_ROWS: { title: string; className?: string; hours?: number }[] = [
  { title: '今日更新', hours: 24 },
  { title: '国产剧', className: '国产剧' },
  { title: '韩剧', className: '韩国剧' },
  { title: '欧美剧', className: '欧美剧' },
  { title: '短剧', className: '短剧大全' },
  { title: '国产动漫', className: '国产动漫' },
  { title: '日韩动漫', className: '日韩动漫' },
  { title: '综艺', className: '大陆综艺' },
  { title: '动作片', className: '动作片' },
  { title: '喜剧片', className: '喜剧片' },
];

const DOUBAN_ROWS: { title: string; type: Kind; tag: string }[] = [
  { title: '豆瓣热门电影', type: 'movie', tag: '热门' },
  { title: '豆瓣高分', type: 'movie', tag: '豆瓣高分' },
];

function useDouban(type: Kind, tag: string, limit = 30) {
  return useQuery({
    queryKey: ['douban', type, tag, limit],
    queryFn: ({ signal }) => api.douban(type, tag, 0, limit, signal),
    staleTime: 30 * 60_000,
  });
}

function useClasses() {
  return useQuery({
    queryKey: ['catalog-classes'],
    queryFn: ({ signal }) => api.catalogClasses(signal),
    staleTime: 6 * 60 * 60_000,
    retry: 1,
  });
}

export function HomePortal({ onPick, onOpen }: Handlers) {
  const doubanEnabled = useAppStore((s) => s.doubanEnabled);
  const classesQuery = useClasses();
  const classes = classesQuery.data?.classes ?? [];
  const [cat, setCat] = useState('home');

  const tops = TOP_ORDER.map((name) => classes.find((c) => c.name === name && c.pid === '0')).filter(
    (c): c is CatalogClass => Boolean(c)
  );
  const current = tops.find((c) => c.id === cat);
  const idOf = (name?: string) => (name ? classes.find((c) => c.name === name)?.id : undefined);
  const parentOf = (id?: string) => {
    const c = classes.find((x) => x.id === id);
    return c ? (c.pid === '0' ? c.id : c.pid) : undefined;
  };

  return (
    <div>
      <nav aria-label="分类" className="flex gap-1 mb-5 overflow-x-auto no-scrollbar">
        {[{ id: 'home', name: '首页' }, ...tops].map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={cn(
              'shrink-0 px-4 py-2 rounded-full text-[15px] transition-colors',
              cat === c.id ? 'bg-accent text-on-accent font-medium' : 'text-muted hover:text-content hover:bg-hover'
            )}
          >
            {TOP_LABELS[c.name] ?? c.name}
          </button>
        ))}
      </nav>

      {current ? (
        <CategoryGrid
          key={current.id}
          parent={current}
          subs={classes.filter((c) => c.pid === current.id)}
          onOpen={onOpen}
        />
      ) : (
        <>
          {doubanEnabled && <HeroCarousel onPick={onPick} />}
          {doubanEnabled && <HotSearch onPick={onPick} />}
          {classesQuery.isSuccess &&
            CATALOG_ROWS.map((r) => {
              const t = idOf(r.className);
              if (r.className && !t) return null;
              const parent = parentOf(t);
              return (
                <CatalogRow
                  key={r.title}
                  title={r.title}
                  t={t}
                  hours={r.hours}
                  onOpen={onOpen}
                  onMore={parent ? () => setCat(parent) : undefined}
                />
              );
            })}
          {doubanEnabled &&
            DOUBAN_ROWS.map((r) => <DoubanRow key={r.title} {...r} onPick={onPick} />)}
        </>
      )}
    </div>
  );
}

/** 大图轮播：竖版海报做模糊背景 + 清晰海报 + 片名，6 秒自动切换，悬停暂停 */
function HeroCarousel({ onPick }: { onPick: (title: string) => void }) {
  const query = useDouban('movie', '热门', 30);
  const items = (query.data?.items ?? []).slice(0, 6);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);

  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 6000);
    return () => clearInterval(t);
  }, [paused, items.length]);

  if (query.isLoading) return <div className="h-[340px] lg:h-[420px] rounded-2xl bg-chip animate-pulse mb-6" />;
  if (items.length === 0) return null;

  return (
    <section
      aria-label="热门推荐"
      className="relative h-[340px] lg:h-[420px] rounded-2xl overflow-hidden mb-6 bg-black"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {items.map((it, i) => (
        <div
          key={it.id}
          className={cn('absolute inset-0 transition-opacity duration-700', i === idx ? 'opacity-100' : 'opacity-0 pointer-events-none')}
        >
          <SmartImage
            url={it.cover}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
          <div className="relative h-full flex items-center gap-8 px-8 lg:px-14">
            <div className="flex-1 min-w-0 text-white">
              <p className="text-sm text-white/60 mb-2">正在热映 · 豆瓣热门</p>
              <h2 className="text-3xl lg:text-5xl font-bold mb-3 line-clamp-2">{it.title}</h2>
              {it.rating && <p className="text-lg text-rating mb-6">★ {it.rating}</p>}
              <button onClick={() => onPick(it.title)} className="btn-primary px-6 py-2.5 rounded-full text-base font-medium">
                <Icon name="search" className="w-4 h-4" />
                立即观看
              </button>
            </div>
            <button
              onClick={() => onPick(it.title)}
              className="hidden sm:block shrink-0 h-[80%] aspect-[2/3] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 hover:scale-[1.03] transition-transform"
              aria-label={it.title}
            >
              <SmartImage url={it.cover} mode={imageProxyMode} customProxy={customImageProxy} alt={it.title} className="w-full h-full object-cover" />
            </button>
          </div>
        </div>
      ))}

      <div className="absolute bottom-4 left-8 lg:left-14 flex gap-2">
        {items.map((it, i) => (
          <button
            key={it.id}
            onClick={() => setIdx(i)}
            aria-label={`第 ${i + 1} 张：${it.title}`}
            className={cn('h-1.5 rounded-full transition-all', i === idx ? 'w-8 bg-white' : 'w-3 bg-white/40 hover:bg-white/70')}
          />
        ))}
      </div>
      <button
        onClick={() => setIdx((i) => (i - 1 + items.length) % items.length)}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white text-xl hover:bg-black/70"
        aria-label="上一张"
      >‹</button>
      <button
        onClick={() => setIdx((i) => (i + 1) % items.length)}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white text-xl hover:bg-black/70"
        aria-label="下一张"
      >›</button>
    </section>
  );
}

/** 热搜：取电影周榜 + 国产剧周榜前几名，点一下直接搜 */
function HotSearch({ onPick }: { onPick: (title: string) => void }) {
  const movies = useQuery({ queryKey: ['hot-list', 'douban_movie_weekly'], queryFn: ({ signal }) => api.hotList('douban_movie_weekly', signal), staleTime: 30 * 60_000 });
  const tvs = useQuery({ queryKey: ['hot-list', 'douban_tv_chinese'], queryFn: ({ signal }) => api.hotList('douban_tv_chinese', signal), staleTime: 30 * 60_000 });
  const titles = Array.from(
    new Set([...(tvs.data?.items ?? []).slice(0, 6), ...(movies.data?.items ?? []).slice(0, 6)].map((i: DoubanItem) => i.title))
  );
  if (titles.length === 0) return null;
  return (
    <div className="flex items-center gap-2 mb-8 overflow-x-auto no-scrollbar">
      <span className="shrink-0 text-sm font-medium text-accent">🔥 热搜</span>
      {titles.map((t, i) => (
        <button
          key={t}
          onClick={() => onPick(t)}
          className="shrink-0 px-3 py-1 rounded-full bg-chip text-sm text-muted hover:text-content hover:bg-hover"
        >
          <span className={cn('mr-1', i < 3 ? 'text-accent font-semibold' : 'text-faint')}>{i + 1}</span>
          {t}
        </button>
      ))}
    </div>
  );
}

/** 片库海报卡：源站海报 + 更新状态角标，点击打开详情选集 */
function CatalogCard({ item, onOpen }: { item: SearchResultItem; onOpen: (item: SearchResultItem) => void }) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <button
      onClick={() => onOpen(item)}
      className="card w-full text-left hover:scale-[1.03] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <div className="relative aspect-[2/3] bg-chip">
        {item.pic && !imgFailed ? (
          <SmartImage
            url={item.pic}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt={item.name}
            className="w-full h-full object-cover"
            onExhausted={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-2 text-center text-sm text-faint">{item.name}</div>
        )}
        {item.remarks && (
          <span className="absolute bottom-0 inset-x-0 px-2 pt-5 pb-1.5 text-xs text-white text-right truncate bg-gradient-to-t from-black/80 to-transparent">
            {item.remarks}
          </span>
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className="text-sm text-content truncate">{item.name}</p>
        <p className="text-xs text-faint truncate">{[item.year && item.year !== '0' ? item.year : '', item.typeName].filter(Boolean).join(' · ') || ' '}</p>
      </div>
    </button>
  );
}

/** 横排容器：左右箭头翻页，触控板横划同样可用 */
function ScrollShelf({ title, onMore, children }: { title: string; onMore?: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };
  return (
    <section aria-label={title} className="mb-8 group/row">
      <div className="flex items-end justify-between mb-3">
        <h2 className="text-xl font-semibold text-content">{title}</h2>
        {onMore && <button onClick={onMore} className="text-sm text-muted hover:text-accent">更多 ›</button>}
      </div>
      <div className="relative">
        <div ref={ref} className="flex gap-3 overflow-x-auto no-scrollbar scroll-smooth snap-x">
          {children}
        </div>
        <ArrowButton side="left" onClick={() => scroll(-1)} />
        <ArrowButton side="right" onClick={() => scroll(1)} />
      </div>
    </section>
  );
}

const SHELF_ITEM = 'shrink-0 w-[150px] lg:w-[170px] snap-start';

function ShelfSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className={SHELF_ITEM}>
          <div className="aspect-[2/3] rounded-lg bg-chip animate-pulse" />
          <div className="h-3 mt-2 rounded bg-chip animate-pulse" />
        </div>
      ))}
    </>
  );
}

/** 片库分区：取前两页（约 40 部） */
function CatalogRow({ title, t, hours, onOpen, onMore }: { title: string; t?: string; hours?: number; onOpen: (item: SearchResultItem) => void; onMore?: () => void }) {
  const query = useQuery({
    queryKey: ['catalog-row', t, hours],
    queryFn: async ({ signal }) => {
      const pages = await Promise.all([1, 2].map((pg) => api.catalog({ t, pg, h: hours }, signal).catch(() => null)));
      return pages.flatMap((p) => p?.list ?? []);
    },
    staleTime: 5 * 60_000,
  });
  const items = query.data ?? [];
  if (query.isError || (!query.isLoading && items.length === 0)) return null;
  return (
    <ScrollShelf title={title} onMore={onMore}>
      {query.isLoading ? (
        <ShelfSkeleton />
      ) : (
        items.map((item) => (
          <div key={`${item.sourceKey}_${item.vodId}`} className={SHELF_ITEM}>
            <CatalogCard item={item} onOpen={onOpen} />
          </div>
        ))
      )}
    </ScrollShelf>
  );
}

function DoubanRow({ title, type, tag, onPick }: { title: string; type: Kind; tag: string; onPick: (title: string) => void }) {
  const query = useDouban(type, tag, 30);
  const items = query.data?.items ?? [];
  if (query.isError || (!query.isLoading && items.length === 0)) return null;
  return (
    <ScrollShelf title={title}>
      {query.isLoading ? (
        <ShelfSkeleton />
      ) : (
        items.map((item) => (
          <div key={item.id} className={SHELF_ITEM}>
            <DoubanCard item={item} onClick={() => onPick(item.title)} />
          </div>
        ))
      )}
    </ScrollShelf>
  );
}

function ArrowButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={side === 'left' ? '向左翻' : '向右翻'}
      className={cn(
        'hidden md:flex absolute top-[38%] -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full',
        'bg-black/60 text-white text-2xl opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-black/80',
        side === 'left' ? '-left-4' : '-right-4'
      )}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}

/**
 * 分类页：子分类筛选 + 无限滚动网格。
 * 一级分类本身有足量影片（如短剧）时额外提供「全部」；否则默认第一个子分类。
 */
function CategoryGrid({ parent, subs, onOpen }: { parent: CatalogClass; subs: CatalogClass[]; onOpen: (item: SearchResultItem) => void }) {
  const parentProbe = useQuery({
    queryKey: ['catalog-page', parent.id, 1],
    queryFn: ({ signal }) => api.catalog({ t: parent.id, pg: 1 }, signal),
    staleTime: 5 * 60_000,
  });
  const parentHasMany = (parentProbe.data?.total ?? 0) >= 100 || subs.length === 0;
  const chips = parentHasMany ? [{ ...parent, name: '全部' }, ...subs] : subs;
  const [picked, setPicked] = useState<string | null>(null);
  const t = picked ?? (parentProbe.isLoading && subs.length > 0 ? null : chips[0]?.id ?? null);

  return (
    <section>
      {chips.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {chips.map((c) => (
            <button
              key={c.id}
              onClick={() => setPicked(c.id)}
              className={cn(
                'px-3 py-1 rounded-full text-sm transition-colors',
                c.id === t ? 'bg-accent text-on-accent' : 'bg-chip text-muted hover:text-content hover:bg-hover'
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {t ? <InfiniteGrid key={t} t={t} onOpen={onOpen} /> : <GridSkeleton />}
    </section>
  );
}

const GRID = 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4';

function InfiniteGrid({ t, onOpen }: { t: string; onOpen: (item: SearchResultItem) => void }) {
  const query = useInfiniteQuery({
    queryKey: ['catalog-infinite', t],
    queryFn: ({ pageParam, signal }) => api.catalog({ t, pg: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pagecount ? last.page + 1 : undefined),
    staleTime: 5 * 60_000,
  });
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '600px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (query.isError) return <p className="text-center text-sm text-faint py-12">片库加载失败，请稍后重试</p>;
  if (query.isLoading) return <GridSkeleton />;

  const seen = new Set<string>();
  const items = (query.data?.pages ?? []).flatMap((p) => p.list).filter((it) => {
    const k = `${it.sourceKey}_${it.vodId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const total = query.data?.pages[0]?.total ?? 0;

  return (
    <>
      <p className="text-sm text-faint mb-3">共 {total.toLocaleString()} 部</p>
      <div className={GRID}>
        {items.map((item) => (
          <CatalogCard key={`${item.sourceKey}_${item.vodId}`} item={item} onOpen={onOpen} />
        ))}
      </div>
      <div ref={sentinel} className="py-8 text-center text-sm text-faint">
        {isFetchingNextPage ? '加载中…' : hasNextPage ? '' : '已经到底了'}
      </div>
    </>
  );
}

function GridSkeleton() {
  return (
    <div className={GRID}>
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i}>
          <div className="aspect-[2/3] rounded-lg bg-chip animate-pulse" />
          <div className="h-3 mt-2 rounded bg-chip animate-pulse" />
        </div>
      ))}
    </div>
  );
}
