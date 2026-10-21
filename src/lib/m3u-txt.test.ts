import { describe, expect, it } from 'vitest';
import { parseM3u } from './m3u-parser';

describe('parseM3u txt 频道列表', () => {
  it('按 #genre# 分组，频道名,地址 解析，多地址拆分并去重', () => {
    const txt = '央视频道,#genre#\r\nCCTV1,http://a.com/1.m3u8\r\nCCTV1,http://b.com/1.m3u8#http://a.com/1.m3u8\r\n卫视,#genre#\r\n湖南卫视,https://c.com/hn.m3u8$线路1\r\n无效行\r\n';
    const list = parseM3u(txt);
    expect(list.map((c) => [c.group, c.name, c.url])).toEqual([
      ['央视频道', 'CCTV1', 'http://a.com/1.m3u8'],
      ['央视频道', 'CCTV1', 'http://b.com/1.m3u8'],
      ['卫视', '湖南卫视', 'https://c.com/hn.m3u8'],
    ]);
  });

  it('标准 M3U 不走 txt 分支', () => {
    const m3u = '#EXTM3U\n#EXTINF:-1 group-title="央视",CCTV-1\nhttp://a.com/1.m3u8\n';
    expect(parseM3u(m3u)[0]).toMatchObject({ name: 'CCTV-1', group: '央视' });
  });
});
