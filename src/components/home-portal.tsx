'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { DoubanItem } from '@/lib/types';
import { DoubanCard } from './video-card';
import { SmartImage } from './smart-image';
import { Icon } from './icon';

/**
 * 门户式首页（仿主流影视站布局）：分类导航 + 大图轮播 + 热搜 + 分区横排。
 * 数据全部来自豆瓣推荐接口，点击任意影片即按片名搜索。
 */
type Kind = 'movie' | 'tv';
interface Row { title: string; type: Kind; tag: string }

const CATEGORIES: { id: string; label: string; type?: Kind; tags?: string[] }[] = [
  { id: 'home', label: '首页' },
  { id: 'movie', label: '电影', type: 'movie', tags: ['热门', '最新', '豆瓣高分', '华语', '欧美', '韩国', '日本', '经典', '冷门佳片'] },
  { id: 'tv', label: '电视剧', type: 'tv', tags: ['热门', '国产剧', '美剧', '韩剧', '日剧', '港剧', '英剧'] },
  { id: 'show', label: '综艺', type: 'tv', tags: ['综艺'] },
  { id: 'anime', label: '动漫', type: 'tv', tags: ['日本动画'] },
  { id: 'doc', label: '纪录片', type: 'tv', tags: ['纪录片'] },
];

const HOME_ROWS: Row[] = [
  { title: '热门电影', type: 'movie', tag: '热门' },
  { title: '热播国产剧', type: 'tv', tag: '国产剧' },
  { title: '最新上线', type: 'movie', tag: '最新' },
  { title: '热门美剧', type: 'tv', tag: '美剧' },
  { title: '韩剧', type: 'tv', tag: '韩剧' },
  { title: '综艺', type: 'tv', tag: '综艺' },
  { title: '动漫', type: 'tv', tag: '日本动画' },
  { title: '豆瓣高分', type: 'movie', tag: '豆瓣高分' },
];

function useDouban(type: Kind, tag: string, limit = 30) {
  return useQuery({
    queryKey: ['douban', type, tag, limit],
    queryFn: ({ signal }) => api.douban(type, tag, 0, limit, signal),
    staleTime: 30 * 60_000,
  });
}

export function HomePortal({ onPick }: { onPick: (title: string) => void }) {
  const doubanEnabled = useAppStore((s) => s.doubanEnabled);
  const [cat, setCat] = useState('home');
  if (!doubanEnabled) return null;
  const current = CATEGORIES.find((c) => c.id === cat)!;

  return (
    <div>
      <nav aria-label="分类" className="flex gap-1 mb-5 overflow-x-auto no-scrollbar">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={cn(
              'shrink-0 px-4 py-2 rounded-full text-[15px] transition-colors',
              cat === c.id ? 'bg-accent text-on-accent font-medium' : 'text-muted hover:text-content hover:bg-hover'
            )}
          >
            {c.label}
          </button>
        ))}
      </nav>

      {cat === 'home' ? (
        <>
          <HeroCarousel onPick={onPick} />
          <HotSearch onPick={onPick} />
          {HOME_ROWS.map((r) => (
            <ScrollRow
              key={r.title}
              row={r}
              onPick={onPick}
              onMore={() => {
                const target = CATEGORIES.find((c) => c.type === r.type && c.tags?.includes(r.tag));
                if (target) setCat(target.id);
              }}
            />
          ))}
        </>
      ) : (
        <CategoryGrid key={current.id} type={current.type!} tags={current.tags!} onPick={onPick} />
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
              <button
                onClick={() => onPick(it.title)}
                className="btn-primary px-6 py-2.5 rounded-full text-base font-medium"
              >
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

/** 分区横排：左右箭头翻页，触控板横划同样可用 */
function ScrollRow({ row, onPick, onMore }: { row: Row; onPick: (title: string) => void; onMore: () => void }) {
  const query = useDouban(row.type, row.tag, 30);
  const ref = useRef<HTMLDivElement>(null);
  const items = query.data?.items ?? [];
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };
  if (query.isError || (!query.isLoading && items.length === 0)) return null;

  return (
    <section aria-label={row.title} className="mb-8 group/row">
      <div className="flex items-end justify-between mb-3">
        <h2 className="text-xl font-semibold text-content">{row.title}</h2>
        <button onClick={onMore} className="text-sm text-muted hover:text-accent">更多 ›</button>
      </div>
      <div className="relative">
        <div ref={ref} className="flex gap-3 overflow-x-auto no-scrollbar scroll-smooth snap-x">
          {query.isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="shrink-0 w-[150px] lg:w-[170px]">
                  <div className="aspect-[2/3] rounded-lg bg-chip animate-pulse" />
                  <div className="h-3 mt-2 rounded bg-chip animate-pulse" />
                </div>
              ))
            : items.map((item) => (
                <div key={item.id} className="shrink-0 w-[150px] lg:w-[170px] snap-start">
                  <DoubanCard item={item} onClick={() => onPick(item.title)} />
                </div>
              ))}
        </div>
        <ArrowButton side="left" onClick={() => scroll(-1)} />
        <ArrowButton side="right" onClick={() => scroll(1)} />
      </div>
    </section>
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

/** 分类页：标签筛选 + 大网格 */
function CategoryGrid({ type, tags, onPick }: { type: Kind; tags: string[]; onPick: (title: string) => void }) {
  const [tag, setTag] = useState(tags[0]);
  const query = useDouban(type, tag, 50);
  const items = query.data?.items ?? [];
  return (
    <section>
      {tags.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(t)}
              className={cn(
                'px-3 py-1 rounded-full text-sm transition-colors',
                t === tag ? 'bg-accent text-on-accent' : 'bg-chip text-muted hover:text-content hover:bg-hover'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {query.isError ? (
        <p className="text-center text-sm text-faint py-12">内容加载失败，请稍后重试</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
          {query.isLoading
            ? Array.from({ length: 14 }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-[2/3] rounded-lg bg-chip animate-pulse" />
                  <div className="h-3 mt-2 rounded bg-chip animate-pulse" />
                </div>
              ))
            : items.map((item) => <DoubanCard key={item.id} item={item} onClick={() => onPick(item.title)} />)}
        </div>
      )}
    </section>
  );
}
