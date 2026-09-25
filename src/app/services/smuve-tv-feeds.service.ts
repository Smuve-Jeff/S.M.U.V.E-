import { Injectable, inject } from '@angular/core';
import { APP_SECURITY_CONFIG } from '../app.security';
import { TokenService } from './token.service';

/**
 * Live feeds and the first-party radio catalogue for S.M.U.V.E. TV.
 *
 * Two kinds of real content sit behind S.M.U.V.E. TV's stations:
 *
 * 1. `SMUVE_TV_LIVE_FEEDS` — free, publicly distributed live channels (public
 *    broadcasters and ad-supported FAST services). Every URL in this list was
 *    played in real Chromium before being added: hls.js reached `FRAG_LOADED`
 *    and buffered actual media. The channels added since were held to the same
 *    bar by hand — the manifest was fetched, its variant playlist followed, and
 *    the first media fragment downloaded real bytes — which is exactly what
 *    hls.js walks before it fires `FRAG_LOADED`. Channels that only parsed
 *    their manifest but 404'd on fragments were removed, so nothing here is
 *    aspirational.
 *
 *    The catalogue is deliberately broader than the station line-up: it is the
 *    pool a station can be re-fed from without anything having to be invented,
 *    and it is grouped by `genre` so a station can be handed a whole category
 *    of verified feeds.
 *
 * 2. The official Smuve Jeff catalogue, read from Apple's public, CORS-enabled
 *    iTunes catalogue API. It returns the artist's real releases with the
 *    official preview audio Apple hosts. The previews are ~30 seconds — that is
 *    the licence those URLs carry, so the UI labels them as previews rather than
 *    pretending they are full tracks. Full-length audio comes from the artist's
 *    own authorized files, imported in the module.
 */

export type SmuveTvFeedGenre =
  | 'news'
  | 'entertainment'
  | 'music'
  | 'sports'
  | 'documentary'
  | 'movies'
  | 'comedy'
  | 'cartoons'
  | 'vintage';

/**
 * Picker labels for the catalogue's genres, in the order the feed picker
 * should stack them. With 150+ verified feeds, one flat list stops being a
 * choice, so the picker groups by these.
 */
export const SMUVE_TV_FEED_GENRE_LABELS: Readonly<
  Record<SmuveTvFeedGenre, string>
> = {
  news: 'NEWS',
  entertainment: 'ENTERTAINMENT',
  movies: 'MOVIES',
  comedy: 'COMEDY',
  cartoons: 'CARTOONS',
  vintage: 'VINTAGE',
  sports: 'SPORTS',
  documentary: 'DOCUMENTARY',
  music: 'MUSIC',
};

export interface SmuveTvLiveFeed {
  id: string;
  name: string;
  /** HLS manifest. Verified to buffer and play in Chromium before inclusion. */
  url: string;
  genre: SmuveTvFeedGenre;
  /** Who actually operates the stream — surfaced so provenance is never implied. */
  operator: string;
  /** Where the stream is published free of charge. */
  source: string;
}

/**
 * Every entry below plays. The list is deliberately larger than the station
 * line-up so a station can be re-fed without anything being invented.
 */
export const SMUVE_TV_LIVE_FEEDS: readonly SmuveTvLiveFeed[] = [
  // ── Public broadcasters ────────────────────────────────
  {
    id: 'france24-en',
    name: 'FRANCE 24 ENGLISH',
    url: 'https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_5000.m3u8',
    genre: 'news',
    operator: 'France Médias Monde',
    source: 'Public broadcaster',
  },
  {
    id: 'dw-en',
    name: 'DW ENGLISH',
    url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8',
    genre: 'news',
    operator: 'Deutsche Welle',
    source: 'Public broadcaster',
  },
  {
    id: 'euronews-en',
    name: 'EURONEWS ENGLISH',
    url: 'https://cdn-euronews.akamaized.net/live/eds/euronews-en/25002/index.m3u8',
    genre: 'news',
    operator: 'Euronews',
    source: 'Public broadcaster',
  },
  {
    id: 'aljazeera-en',
    name: 'AL JAZEERA ENGLISH',
    url: 'https://live-hls-apps-aje-fa.getaj.net/AJE/index.m3u8',
    genre: 'news',
    operator: 'Al Jazeera Media Network',
    source: 'Public broadcaster',
  },
  // ── Ad-supported free channels ─────────────────────────
  {
    id: 'trt-world',
    name: 'TRT WORLD',
    url: 'https://tv-trtworld.medya.trt.com.tr/master.m3u8',
    genre: 'news',
    operator: 'TRT',
    source: 'Public broadcaster',
  },
  {
    id: 'cna-asia',
    name: 'CNA',
    url: 'https://d2e1asnsl7br7b.cloudfront.net/7782e205e72f43aeb4a48ec97f66ebbe/index.m3u8',
    genre: 'news',
    operator: 'Mediacorp',
    source: 'Public broadcaster',
  },
  {
    id: 'arirang-tv',
    name: 'ARIRANG TV',
    url: 'https://amdlive-ch01-ctnd-com.akamaized.net/arirang_1ch/smil:arirang_1ch.smil/playlist.m3u8',
    // Korea's public broadcaster in English: a news and current-affairs feed,
    // which is the shelf the Seoul desk picks it from.
    genre: 'news',
    operator: 'Arirang TV',
    source: 'Public broadcaster',
  },
  {
    id: 'tagesschau',
    name: 'TAGESSCHAU',
    url: 'https://tagesschau.akamaized.net/hls/live/2020115/tagesschau/tagesschau_1/master.m3u8',
    genre: 'news',
    operator: 'ARD',
    source: 'Public broadcaster',
  },
  {
    id: 'dw-arabic',
    name: 'DW ARABIC',
    url: 'https://dwamdstream103.akamaized.net/hls/live/2015526/dwstream103/master.m3u8',
    genre: 'news',
    operator: 'Deutsche Welle',
    source: 'Public broadcaster',
  },
  {
    id: 'aljazeera-arabic',
    name: 'AL JAZEERA ARABIC',
    url: 'https://live-hls-web-aja.getaj.net/AJA/index.m3u8',
    genre: 'news',
    operator: 'Al Jazeera Media Network',
    source: 'Public broadcaster',
  },
  {
    id: 'ndtv-24x7',
    name: 'NDTV 24X7',
    url: 'https://ndtv24x7elemarchana.akamaized.net/hls/live/2003678/ndtv24x7/master.m3u8',
    genre: 'news',
    operator: 'NDTV',
    source: 'Free live stream (operator-hosted)',
  },
  {
    id: 'abc-news-live',
    name: 'ABC NEWS LIVE',
    url: 'https://pb-0n3n2ej0w8pl9.akamaized.net/ABCNewsLive_Disney.m3u8',
    genre: 'news',
    operator: 'ABC News',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'nbc-news-now',
    name: 'NBC NEWS NOW',
    url: 'https://xumo-drct-nbcnn-ir8ze.fast.nbcuni.com/live/master.m3u8',
    genre: 'news',
    operator: 'NBCUniversal',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'cbs-news-247',
    name: 'CBS NEWS 24/7',
    url: 'https://cbsn-us.cbsnstream.cbsnews.com/out/v1/55a8648e8f134e82a470f83d562deeca/master.m3u8',
    genre: 'news',
    operator: 'CBS News',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'bloomberg-tv',
    name: 'BLOOMBERG TELEVISION',
    url: 'https://bloomberg.com/media-manifest/streams/us.m3u8',
    genre: 'news',
    operator: 'Bloomberg L.P.',
    source: 'Free live stream (operator-hosted)',
  },
  {
    id: 'bloomberg-eu',
    name: 'BLOOMBERG TV EUROPE',
    url: 'https://bloomberg.com/media-manifest/streams/eu.m3u8',
    genre: 'news',
    operator: 'Bloomberg L.P.',
    source: 'Free live stream (operator-hosted)',
  },
  {
    id: 'bloomberg-asia',
    name: 'BLOOMBERG TV ASIA',
    url: 'https://bloomberg.com/media-manifest/streams/asia.m3u8',
    genre: 'news',
    operator: 'Bloomberg L.P.',
    source: 'Free live stream (operator-hosted)',
  },
  {
    id: 'red-bull-tv',
    name: 'RED BULL TV',
    url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
    genre: 'entertainment',
    operator: 'Red Bull Media House',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'tastemade',
    name: 'TASTEMADE',
    url: 'https://tastemade-tdint-rakuten.amagi.tv/playlist.m3u8',
    genre: 'entertainment',
    operator: 'Tastemade',
    source: 'Free ad-supported (FAST)',
  },
  // ── Stingray music channels (free ad-supported) ────────
  {
    id: 'stingray-greatest-hits',
    name: 'STINGRAY GREATEST HITS',
    url: 'https://lotus.stingray.com/manifest/ose-455ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  // Named against the operator's own line-up: `ose-107` is Hit List, not a
  // hip-hop channel, and a station must never be labelled as something it is
  // not.
  {
    id: 'stingray-hit-list',
    name: 'STINGRAY HIT LIST',
    url: 'https://lotus.stingray.com/manifest/ose-107ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-flashback-70s',
    name: 'STINGRAY FLASHBACK 70s',
    url: 'https://lotus.stingray.com/manifest/ose-115ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-jukebox-oldies',
    name: 'STINGRAY JUKEBOX OLDIES',
    url: 'https://lotus.stingray.com/manifest/ose-021ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-todays-kpop',
    name: "STINGRAY TODAY'S K-POP",
    url: 'https://lotus.stingray.com/manifest/ose-317ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-todays-latin-pop',
    name: "STINGRAY TODAY'S LATIN POP",
    url: 'https://lotus.stingray.com/manifest/ose-190ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-romance-latino',
    name: 'STINGRAY ROMANCE LATINO',
    url: 'https://lotus.stingray.com/manifest/ose-202ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-djazz',
    name: 'STINGRAY DJAZZ',
    url: 'https://lotus.stingray.com/manifest/djazz-djaads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-karaoke',
    name: 'STINGRAY KARAOKE',
    url: 'https://lotus.stingray.com/manifest/karaoke-kar000-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-naturescape',
    name: 'STINGRAY NATURESCAPE',
    url: 'https://lotus.stingray.com/manifest/naturescape-a003-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-zenlife',
    name: 'ZENLIFE BY STINGRAY',
    url: 'https://lotus.stingray.com/manifest/zenlife-zen001-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'california-music-channel',
    name: 'CALIFORNIA MUSIC CHANNEL',
    url: 'https://cmc-cmctv-cineverse.amagi.tv/playlist.m3u8',
    genre: 'music',
    operator: 'CMC Television',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-hip-hop-rnb',
    name: 'STINGRAY HIP HOP & R&B',
    url: 'https://lotus.stingray.com/manifest/ose-133ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-soul-storm',
    name: 'STINGRAY SOUL STORM',
    url: 'https://lotus.stingray.com/manifest/ose-134ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-classic-rock',
    name: 'STINGRAY CLASSIC ROCK',
    url: 'https://lotus.stingray.com/manifest/ose-101ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-rock-alternative',
    name: 'STINGRAY ROCK ALTERNATIVE',
    url: 'https://lotus.stingray.com/manifest/ose-102ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-smooth-jazz',
    name: 'STINGRAY SMOOTH JAZZ',
    url: 'https://lotus.stingray.com/manifest/ose-140ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-classica',
    name: 'STINGRAY CLASSICA',
    url: 'https://lotus.stingray.com/manifest/classica-cla008-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-movie-music',
    name: 'STINGRAY MOVIE MUSIC',
    url: 'https://lotus.stingray.com/manifest/cmusic-cme004-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-peaceful-piano',
    name: 'STINGRAY PEACEFUL PIANO',
    url: 'https://lotus.stingray.com/manifest/ose-807ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-focus',
    name: 'STINGRAY MUSIC FOR FOCUS',
    url: 'https://lotus.stingray.com/manifest/ose-814ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-spa',
    name: 'STINGRAY THE SPA',
    url: 'https://lotus.stingray.com/manifest/ose-122ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-easy-listening',
    name: 'STINGRAY EASY LISTENING',
    url: 'https://lotus.stingray.com/manifest/ose-137ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-italo-disco',
    name: 'STINGRAY ITALO DISCO',
    url: 'https://lotus.stingray.com/manifest/ose-311ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-90s',
    name: 'STINGRAY NOTHIN BUT 90s',
    url: 'https://lotus.stingray.com/manifest/ose-142ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-y2k',
    name: 'STINGRAY Y2K',
    url: 'https://lotus.stingray.com/manifest/ose-232ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-everything-80s',
    name: "STINGRAY EVERYTHING 80s",
    url: 'https://lotus.stingray.com/manifest/ose-128ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-souvenirs',
    name: 'STINGRAY SOUVENIRS',
    url: 'https://lotus.stingray.com/manifest/ose-012ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-pop-adult',
    name: 'STINGRAY POP ADULT',
    url: 'https://lotus.stingray.com/manifest/ose-104ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-hot-country',
    name: 'STINGRAY HOT COUNTRY',
    url: 'https://lotus.stingray.com/manifest/ose-108ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-tiktok-radio',
    name: 'STINGRAY TIKTOK RADIO',
    url: 'https://lotus.stingray.com/manifest/ose-185ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-qello-concerts',
    name: 'STINGRAY QELLO CONCERTS',
    url: 'https://lotus.stingray.com/manifest/qello-qello001-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  // ── Sports ─────────────────────────────────────────────
  {
    id: 'bein-sports-xtra',
    name: 'beIN SPORTS XTRA',
    url: 'https://bein-xtra-bein.amagi.tv/playlist.m3u8',
    genre: 'sports',
    operator: 'beIN Media Group',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'acc-digital-network',
    name: 'ACC DIGITAL NETWORK',
    url: 'https://raycom-accdn-firetv.amagi.tv/playlist.m3u8',
    genre: 'sports',
    operator: 'Raycom Sports',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'fuel-tv-emea',
    name: 'FUEL TV',
    url: 'https://amg01074-fueltv-fueltvemeaen-rakuten-b6j62.amagi.tv/hls/amagi_hls_data_rakutenAA-fueltvemeaen/CDN/master.m3u8',
    genre: 'sports',
    operator: 'FUEL TV',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'floracing',
    name: 'FLORACING',
    url: 'https://amg02278-amg02278c1-flosports-worldwide-7592.playouts.now.amagi.tv/playlist.m3u8',
    genre: 'sports',
    operator: 'FloSports',
    source: 'Free ad-supported (FAST)',
  },
  // ── Documentary, science, and true crime ───────────────
  {
    id: 'history-hit',
    name: 'HISTORY HIT',
    url: 'https://lds-timeline-rakuten.amagi.tv/playlist.m3u8',
    genre: 'documentary',
    operator: 'Little Dot Studios',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'inwild',
    name: 'INWILD',
    url: 'https://amg00861-terninternation-inwild-samsunguk-w5wic.amagi.tv/playlist/amg00861-terninternation-inwild-samsunguk/playlist.m3u8',
    genre: 'documentary',
    operator: 'Tern International',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'inwonder',
    name: 'INWONDER',
    url: 'https://amg00861-terninternation-inwonder-samsungau-1k63k.amagi.tv/playlist/amg00861-terninternation-inwonder-samsungau/playlist.m3u8',
    genre: 'documentary',
    operator: 'Tern International',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'love-the-planet',
    name: 'LOVE THE PLANET',
    url: 'https://amg01821-lovetvchannels-lovetheplanetuksamsung-samsunguk-apopw.amagi.tv/playlist/amg01821-lovetvchannels-lovetheplanetuksamsung-samsunguk/playlist.m3u8',
    genre: 'documentary',
    operator: 'Love TV Channels',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'magellantv-now',
    name: 'MAGELLANTV NOW',
    url: 'https://amg00376-magellan-amg00376c5-samsung-au-1708.playouts.now.amagi.tv/playlist/amg00376-magellantv-magellantvnowww-samsungau/playlist.m3u8',
    genre: 'documentary',
    operator: 'MagellanTV',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'curiosity-now',
    name: 'CURIOSITY NOW',
    url: 'https://amg00170-amg00170c4-samsung-gb-4232.playouts.now.amagi.tv/playlist.m3u8',
    genre: 'documentary',
    operator: 'Curiosity Stream',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'court-tv',
    name: 'COURT TV',
    url: 'https://cdn-uw2-prod.tsv2.amagi.tv/linear/amg01438-ewscrippscompan-courttv-tablo/playlist.m3u8',
    genre: 'documentary',
    operator: 'E.W. Scripps Company',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'inside-crime',
    name: 'INSIDE CRIME',
    url: 'https://aenetworks-insidecrime-rakuten.amagi.tv/playlist.m3u8',
    genre: 'documentary',
    operator: 'A+E Networks',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'cna-originals',
    name: 'CNA ORIGINALS',
    url: 'https://amg01082-cna-amg01082c1-rlaxx-us-11304.playouts.now.amagi.tv/playlist.m3u8',
    genre: 'documentary',
    operator: 'Mediacorp',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'bbc-earth-us',
    name: 'BBC EARTH',
    url: 'https://amg00793-amg00793c6-xumo-us-2669.playouts.now.amagi.tv/BBCStudios-BBCEarthA-hls/playlist.m3u8',
    genre: 'documentary',
    operator: 'BBC Studios',
    source: 'Free ad-supported (FAST)',
  },
  // ── Series, film, and lifestyle ────────────────────────
  {
    id: 'mst3k',
    name: 'MYSTERY SCIENCE THEATER 3000',
    url: 'https://mst3k-roku.amagi.tv/playlist.m3u8',
    genre: 'entertainment',
    operator: 'Shout! Factory',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'are-we-there-yet',
    name: 'ARE WE THERE YET?',
    url: 'https://amg00353-lionsgatestudio-arewethereyet-samsunguk-6h2ju.amagi.tv/playlist/amg00353-lionsgatestudio-arewethereyet-samsunguk/playlist.m3u8',
    genre: 'entertainment',
    operator: 'Lionsgate',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'deal-or-no-deal',
    name: 'DEAL OR NO DEAL',
    url: 'https://amg00627-banijaygroup-dealornodeal-samsungau-si7xg.amagi.tv/playlist/amg00627-banijaygroup-dealornodeal-samsungau/playlist.m3u8',
    genre: 'entertainment',
    operator: 'Banijay',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'hells-kitchen',
    name: "HELL'S KITCHEN",
    url: 'https://amg00654-itv-amg00654c1-samsung-au-1072.playouts.now.amagi.tv/itv-hellskitchen-samsung/playlist.m3u8',
    genre: 'entertainment',
    operator: 'ITV Studios',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'circle',
    name: 'CIRCLE',
    url: 'https://circle-roku.amagi.tv/playlist.m3u8',
    genre: 'entertainment',
    operator: 'Circle Network',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'bounce-xl',
    name: 'BOUNCE XL',
    url: 'https://cdn-uw2-prod.tsv2.amagi.tv/linear/amg01438-ewscrippscompan-bouncexl-tablo/playlist.m3u8',
    genre: 'entertainment',
    operator: 'E.W. Scripps Company',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'moviesphere',
    name: 'MOVIESPHERE',
    url: 'https://amg00353-lionsgatestudio-moviesphere-xumo-zh5u0.amagi.tv/playlist.m3u8',
    genre: 'entertainment',
    operator: 'Lionsgate',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'great-movies',
    name: 'GREAT! MOVIES',
    url: 'https://amg01753-narrativeuk-amg01753c3-lg-gb-1833.playouts.now.amagi.tv/playlist/amg01753-narrativeuk-greatmovies-lggb/playlist.m3u8',
    genre: 'entertainment',
    operator: 'Narrative Entertainment',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'cine-nanar',
    name: 'CINE NANAR',
    url: 'https://zylo-cinenanar-rakuten.amagi.tv/playlist.m3u8',
    genre: 'entertainment',
    operator: 'Zylo',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'emotion-l',
    name: 'EMOTION L',
    url: 'https://rakutenaa-zylo-emotional-rakuten-r1zkm.amagi.tv/playlist/rakutenAA-zylo-emotional-rakuten/playlist.m3u8',
    genre: 'entertainment',
    operator: 'Zylo',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'bon-appetit',
    name: 'BON APPETIT',
    url: 'https://bonappetit-samsung.amagi.tv/playlist.m3u8',
    genre: 'entertainment',
    operator: 'Condé Nast',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'aspire-tv-life',
    name: 'ASPIRE TV LIFE',
    url: 'https://uptv-aspiretvlife-klowdtv.amagi.tv/playlist.m3u8',
    genre: 'entertainment',
    operator: 'UPtv / Aspire',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'love-pets',
    name: 'LOVE PETS',
    url: 'https://amg01576-blueskyeenterta-lovepetsemea-samsungse-ctamh.amagi.tv/playlist/amg01576-blueskyeenterta-lovepetsemea-samsungse/playlist.m3u8',
    genre: 'entertainment',
    operator: 'Blue Skye Entertainment',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'accuweather-now',
    name: 'ACCUWEATHER NOW',
    url: 'https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg00684-accuweather-accuweather-plex/playlist.m3u8',
    genre: 'news',
    operator: 'AccuWeather',
    source: 'Free ad-supported (FAST)',
  },
  // ── Movies ─────────────────────────────────────────────
  {
    id: 'shout-tv',
    name: 'SHOUT! TV',
    url: 'https://d1s1wrpgemt9re.cloudfront.net/Shout_TV.m3u8',
    genre: 'movies',
    operator: 'Shout! Factory',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'gravitas-movies',
    name: 'GRAVITAS MOVIES',
    url: 'https://d6dg3ebeih71x.cloudfront.net/Gravitas_Movies.m3u8',
    genre: 'movies',
    operator: 'Gravitas Ventures',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'the-asylum',
    name: 'THE ASYLUM',
    url: 'https://d1i3g4v4xlfhad.cloudfront.net/The_Asylum.m3u8',
    genre: 'movies',
    operator: 'The Asylum',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'midnight-pulp',
    name: 'MIDNIGHT PULP',
    url: 'https://d18l78mi5ujmqr.cloudfront.net/playlist.m3u8',
    genre: 'movies',
    operator: 'Midnight Pulp',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'dove-channel',
    name: 'DOVE CHANNEL',
    url: 'https://d2v2e5kw14egus.cloudfront.net/playlist.m3u8',
    genre: 'movies',
    operator: 'Dove Channel',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'outflix-movies',
    name: 'OUTFLIX MOVIES',
    url: 'https://dg37ei3o66x3s.cloudfront.net/OutTV_US.m3u8',
    genre: 'movies',
    operator: 'OUTtv',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'lifetime-love-and-drama',
    name: 'LIFETIME MOVIES LOVE & DRAMA',
    url: 'https://d1s7megtamek6r.cloudfront.net/Lifetime_Love_and_Drama.m3u8',
    genre: 'movies',
    operator: 'A+E Networks',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'maverick-black-cinema',
    name: 'MAVERICK BLACK CINEMA',
    url: 'https://maverick-maverick-black-cinema-1-us.samsung.wurl.tv/playlist.m3u8',
    genre: 'movies',
    operator: 'Maverick Entertainment',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'allblk-gems',
    name: 'ALLBLK GEMS',
    url: 'https://df1zke3zj042m.cloudfront.net/playlist.m3u8',
    genre: 'movies',
    operator: 'ALLBLK',
    source: 'Free ad-supported (FAST)',
  },
  // ── Comedy ─────────────────────────────────────────────
  {
    id: 'comedy-dynamics',
    name: 'COMEDY DYNAMICS',
    url: 'https://d3a5mry3t5fzw9.cloudfront.net/playlist.m3u8',
    genre: 'comedy',
    operator: 'Comedy Dynamics',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'dry-bar-comedy',
    name: 'DRY BAR COMEDY',
    url: 'https://drybar-drybarcomedy-1-us.samsung.wurl.tv/playlist.m3u8',
    genre: 'comedy',
    operator: 'Dry Bar Comedy',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'jfl-gags',
    name: 'JUST FOR LAUGHS GAGS',
    url: 'https://dzmydakq7xf9n.cloudfront.net/playlist.m3u8',
    genre: 'comedy',
    operator: 'Just for Laughs',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'always-funny-videos',
    name: 'ALWAYS FUNNY VIDEOS',
    url: 'https://d24l3uppudokci.cloudfront.net/playlist.m3u8',
    genre: 'comedy',
    operator: 'Always Funny Videos',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'rifftrax',
    name: 'RIFFTRAX',
    url: 'https://wurlrifftrax.global.transmit.live/hls/68222b9cbe836edbe6f39e74/playlist.m3u8',
    genre: 'comedy',
    operator: 'RiffTrax',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'smosh',
    name: 'SMOSH',
    url: 'https://d2awq8rdysdj3u.cloudfront.net/playlist.m3u8',
    genre: 'comedy',
    operator: 'Smosh',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'portlandia',
    name: 'PORTLANDIA',
    url: 'https://d1uvnirn6lhs2f.cloudfront.net/playlist.m3u8',
    genre: 'comedy',
    operator: 'Portlandia',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'bbc-comedy',
    name: 'BBC COMEDY',
    url: 'https://d1em2hga7sgumq.cloudfront.net/playlist.m3u8',
    genre: 'comedy',
    operator: 'BBC Studios',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'afv',
    name: 'AFV',
    url: 'https://d1o5yzickeowpa.cloudfront.net/playlist.m3u8',
    genre: 'comedy',
    operator: 'AFV',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'bet-tyler-perry-comedy',
    name: 'BET X TYLER PERRY COMEDY',
    url: 'https://d3vmpkkd3o2grv.cloudfront.net/playlist.m3u8',
    genre: 'comedy',
    operator: 'BET',
    source: 'Free ad-supported (FAST)',
  },
  // ── Cartoons & animation ───────────────────────────────
  {
    id: 'toon-goggles',
    name: 'TOON GOGGLES',
    url: 'https://d1eg24xrsfr6kv.cloudfront.net/tg/tg/tg.m3u8',
    genre: 'cartoons',
    operator: 'Toon Goggles',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'toon-goggles-jr',
    name: 'TOON GOGGLES JUNIOR',
    url: 'https://d3i6upqaqzosi1.cloudfront.net/tg/jr_us/tg_jr_us.m3u8',
    genre: 'cartoons',
    operator: 'Toon Goggles',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'kartoon-channel',
    name: 'KARTOON CHANNEL!',
    url: 'https://d2z0ysa6dgxhlc.cloudfront.net/kchan.m3u8',
    genre: 'cartoons',
    operator: 'Kartoon Channel!',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'moonbug',
    name: 'MOONBUG',
    url: 'https://dq2a9ghraf7sw.cloudfront.net/Moonbug.m3u8',
    genre: 'cartoons',
    operator: 'Moonbug Entertainment',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'mr-bean-animated',
    name: 'MR. BEAN (ANIMATED)',
    url: 'https://d2t1w90tnft92.cloudfront.net/Mr_Bean_Animated.m3u8',
    genre: 'cartoons',
    operator: 'Mr. Bean',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'sonic',
    name: 'SONIC THE HEDGEHOG',
    url: 'https://dtwdcugadwtnw.cloudfront.net/master.m3u8',
    genre: 'cartoons',
    operator: 'Sonic',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'yu-gi-oh',
    name: 'YU-GI-OH!',
    url: 'https://dwgcgcahlni2h.cloudfront.net/playlist.m3u8',
    genre: 'cartoons',
    operator: 'Yu-Gi-Oh!',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'retrocrush',
    name: 'RETROCRUSH',
    url: 'https://d2nqmwm1ndpgi2.cloudfront.net/playlist.m3u8',
    genre: 'cartoons',
    operator: 'RetroCrush',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'filmrise-anime',
    name: 'FILMRISE ANIME',
    url: 'https://dvu7aia8rjlfm.cloudfront.net/master.m3u8',
    genre: 'cartoons',
    operator: 'FilmRise',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'its-anime',
    name: "IT'S ANIME",
    url: 'https://d1isoijd9dbbf7.cloudfront.net/playlist.m3u8',
    genre: 'cartoons',
    operator: "It's Anime",
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'lego-channel',
    name: 'THE LEGO CHANNEL',
    url: 'https://dh18i7whff86v.cloudfront.net/index.m3u8',
    genre: 'cartoons',
    operator: 'LEGO',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'happykids',
    name: 'HAPPYKIDS',
    url: 'https://dil9xdvretp0f.cloudfront.net/index.m3u8',
    genre: 'cartoons',
    operator: 'HappyKids',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'barbie-and-friends',
    name: 'BARBIE AND FRIENDS',
    url: 'https://d1xqdnwy1bo05f.cloudfront.net/barb.m3u8',
    genre: 'cartoons',
    operator: 'Mattel',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'hot-wheels-action',
    name: 'HOT WHEELS ACTION',
    url: 'https://dtz4aepbew7ez.cloudfront.net/hotwh.m3u8',
    genre: 'cartoons',
    operator: 'Mattel',
    source: 'Free ad-supported (FAST)',
  },
  // ── Vintage & classic TV ───────────────────────────────
  {
    id: 'cw-gold',
    name: 'CW GOLD',
    url: 'https://d1d726ny1vain2.cloudfront.net/playlist.m3u8',
    genre: 'vintage',
    operator: 'Warner Bros. Television',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'cw-forever',
    name: 'CW FOREVER',
    url: 'https://d1sknsnbkyvie.cloudfront.net/playlist.m3u8',
    genre: 'vintage',
    operator: 'Warner Bros. Television',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'lets-make-a-deal-classic',
    name: "LET'S MAKE A DEAL CLASSIC",
    url: 'https://d35koolwpjpqaf.cloudfront.net/playlist.m3u8',
    genre: 'vintage',
    operator: "Let's Make a Deal",
    source: 'Free ad-supported (FAST)',
  },
  {
    id: '21-jump-street',
    name: '21 JUMP STREET',
    url: 'https://d1oefjzrirx6fc.cloudfront.net/21_Jump_Street_SONO6.m3u8',
    genre: 'vintage',
    operator: '21 Jump Street',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'death-valley-days',
    name: 'DEATH VALLEY DAYS',
    url: 'https://d49k4i5y48mxv.cloudfront.net/SONO66.m3u8',
    genre: 'vintage',
    operator: 'Death Valley Days',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'unsolved-mysteries',
    name: 'UNSOLVED MYSTERIES',
    url: 'https://d31z96rdrmwfsp.cloudfront.net/master.m3u8',
    genre: 'vintage',
    operator: 'Unsolved Mysteries',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'degrassi',
    name: 'DEGRASSI',
    url: 'https://d3537vnymvfque.cloudfront.net/playlist.m3u8',
    genre: 'vintage',
    operator: 'Degrassi',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'filmrise-westerns',
    name: 'FILMRISE WESTERNS',
    url: 'https://dz05z8iljgvbe.cloudfront.net/master.m3u8',
    genre: 'vintage',
    operator: 'FilmRise',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'fear-factor',
    name: 'FEAR FACTOR',
    url: 'https://d2y1l0qikd751h.cloudfront.net/Fear_Factor.m3u8',
    genre: 'vintage',
    operator: 'Fear Factor',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'wipeout-xtra',
    name: 'WIPEOUT XTRA',
    url: 'https://djoigjo2g1xzo.cloudfront.net/Wipeout_Xtra.m3u8',
    genre: 'vintage',
    operator: 'Wipeout Xtra',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'antiques-roadshow-uk',
    name: 'ANTIQUES ROADSHOW UK',
    url: 'https://dbbg0ax8bgo7d.cloudfront.net/playlist.m3u8',
    genre: 'vintage',
    operator: 'BBC Studios',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'electricnow',
    name: 'ELECTRICNOW',
    url: 'https://pb-aexv6wqzkg929.akamaized.net/ElectricNOW.m3u8',
    genre: 'vintage',
    operator: 'Electric Entertainment',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'acorn-mysteries',
    name: 'ACORN TV MYSTERIES',
    url: 'https://d25ms2fshb3tcf.cloudfront.net/playlist.m3u8',
    genre: 'vintage',
    operator: 'Acorn TV',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'biography-icons',
    name: 'BIOGRAPHY: THE ICONS',
    url: 'https://dkaiai6digij6.cloudfront.net/Lights_Legends_Icons.m3u8',
    genre: 'vintage',
    operator: 'Biography',
    source: 'Free ad-supported (FAST)',
  },
  // ── Sports ─────────────────────────────────────────────
  {
    id: 'fox-sports',
    name: 'FOX SPORTS',
    url: 'https://d1jzu95oc8fgt3.cloudfront.net/FOX_Sports.m3u8',
    genre: 'sports',
    operator: 'FOX Sports',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'nbc-sports-now',
    name: 'NBC SPORTS NOW',
    url: 'https://d1m1xk35ma8qfl.cloudfront.net/master.m3u8',
    genre: 'sports',
    operator: 'NBCUniversal',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stadium',
    name: 'STADIUM',
    url: 'https://wurl120sports.global.transmit.live/hls/679a907dce42a042c23ace37/v1/stadium_gracenote/samsung_us/latest/main/hls/playlist.m3u8',
    genre: 'sports',
    operator: 'Stadium',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'roku-sports',
    name: 'ROKU SPORTS CHANNEL',
    url: 'https://d3ialx0k0mla2a.cloudfront.net/Roku_Sports_Channel.m3u8',
    genre: 'sports',
    operator: 'Roku',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'unbeaten-sports',
    name: 'UNBEATEN SPORTS',
    url: 'https://d1t5afz6qed3xk.cloudfront.net/Unbeaten.m3u8',
    genre: 'sports',
    operator: 'Unbeaten',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'womens-sports-network',
    name: "WOMEN'S SPORTS NETWORK",
    url: 'https://d39accvx65hq9o.cloudfront.net/Womens_Sports_Network.m3u8',
    genre: 'sports',
    operator: "Women's Sports Network",
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'fifa-plus',
    name: 'FIFA+',
    url: 'https://d2w9q46ikgrcwx.cloudfront.net/v1/sysdata_s_p_a_fifa_7/samsungheadend_us/latest/main/hls/playlist.m3u8',
    genre: 'sports',
    operator: 'FIFA',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'motogp',
    name: 'MOTOGP CHANNEL',
    url: 'https://d1kqz1q7knpsue.cloudfront.net/MotoGP.m3u8',
    genre: 'sports',
    operator: 'Dorna Sports',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'nascar-channel',
    name: 'NASCAR CHANNEL',
    url: 'https://dzz957bqk62e8.cloudfront.net/NASCAR.m3u8',
    genre: 'sports',
    operator: 'NASCAR',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'racer-select',
    name: 'RACER SELECT',
    url: 'https://d85qrcmltdfp8.cloudfront.net/MAVTV_Select.m3u8',
    genre: 'sports',
    operator: 'RACER',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'tna-wrestling',
    name: 'TNA WRESTLING',
    url: 'https://dpltey7dr5q2g.cloudfront.net/TNA_Wrestling.m3u8',
    genre: 'sports',
    operator: 'TNA Wrestling',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'espn8-the-ocho',
    name: 'ESPN8 THE OCHO',
    url: 'https://d3b6q2ou5kp8ke.cloudfront.net/ESPNTheOcho.m3u8',
    genre: 'sports',
    operator: 'ESPN',
    source: 'Free ad-supported (FAST)',
  },
  // ── News ───────────────────────────────────────────────
  {
    id: 'cbc-news',
    name: 'CBC NEWS',
    url: 'https://d2ny9lo79ujali.cloudfront.net/CBC_News_International.m3u8',
    genre: 'news',
    operator: 'CBC',
    source: 'Public broadcaster',
  },
  {
    id: 'today-all-day',
    name: 'TODAY ALL DAY',
    url: 'https://d37kx062o4ii0p.cloudfront.net/master.m3u8',
    genre: 'news',
    operator: 'NBCUniversal',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'bloomberg-tv-plus',
    name: 'BLOOMBERG TV+',
    url: 'https://d2d98ykcmmhgd4.cloudfront.net/v1/bloomberg_bloombergtv_2/samsungheadend_us/latest/main/hls/playlist.m3u8',
    genre: 'news',
    operator: 'Bloomberg L.P.',
    source: 'Free live stream (operator-hosted)',
  },
  // ── Documentary & factual ──────────────────────────────
  {
    id: 'documentary-plus',
    name: 'DOCUMENTARY+',
    url: 'https://d1kx9y4yhe8h6h.cloudfront.net/playlist.m3u8',
    genre: 'documentary',
    operator: 'Documentary+',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'vice',
    name: 'VICE',
    url: 'https://d1ocru52bkg5e9.cloudfront.net/VICE.m3u8',
    genre: 'documentary',
    operator: 'VICE Media',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'ted',
    name: 'TED',
    url: 'https://d1b16tvvxk3tnu.cloudfront.net/TED.m3u8',
    genre: 'documentary',
    operator: 'TED',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'pbs-nature',
    name: 'PBS NATURE',
    url: 'https://d3mr43kyql7wgk.cloudfront.net/PBS_Nature.m3u8',
    genre: 'documentary',
    operator: 'PBS',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'wildearth',
    name: 'WILDEARTH',
    url: 'https://dqga3jatxofgx.cloudfront.net/WildEarth.m3u8',
    genre: 'documentary',
    operator: 'WildEarth',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'first-48',
    name: 'THE FIRST 48',
    url: 'https://pb-bp21lplgw5225.akamaized.net/v1/ae_networks_first48_1/samsungheadend_us/latest/main/hls/playlist.m3u8',
    genre: 'documentary',
    operator: 'A+E Networks',
    source: 'Free ad-supported (FAST)',
  },
  // ── Entertainment ──────────────────────────────────────
  {
    id: 'americas-got-talent',
    name: "AMERICA'S GOT TALENT",
    url: 'https://d1i40wgstaij6f.cloudfront.net/webvtt/v1/18584c3f3a2a4df8/88886062/master.m3u8',
    genre: 'entertainment',
    operator: "America's Got Talent",
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'hot-ones',
    name: 'HOT ONES',
    url: 'https://d532j1ra4v4q9.cloudfront.net/SONO65.m3u8',
    genre: 'entertainment',
    operator: 'First We Feast',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'buzzfeed-unsolved',
    name: 'BUZZFEED UNSOLVED',
    url: 'https://d1727vwt6h9ghr.cloudfront.net/BuzzFeed_Unsolved.m3u8',
    genre: 'entertainment',
    operator: 'BuzzFeed',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'dhar-mann-tv',
    name: 'DHAR MANN TV',
    url: 'https://d3p03mkvhnk6ll.cloudfront.net/playlist.m3u8',
    genre: 'entertainment',
    operator: 'Dhar Mann',
    source: 'Free ad-supported (FAST)',
  },
  // ── Music ──────────────────────────────────────────────
  {
    id: 'xite-80s-flashback',
    name: 'XITE 80S FLASHBACK',
    url: 'https://d1n314cytqn9r3.cloudfront.net/XITE_80s_Flashback.m3u8',
    genre: 'music',
    operator: 'XITE',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'xite-90s-throwback',
    name: 'XITE 90S THROWBACK',
    url: 'https://d284aawtm5vi48.cloudfront.net/XITE_90s_Throwback.m3u8',
    genre: 'music',
    operator: 'XITE',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'xite-hits',
    name: 'XITE HITS',
    url: 'https://d726x48n2pd5h.cloudfront.net/XITE_Hits.m3u8',
    genre: 'music',
    operator: 'XITE',
    source: 'Free ad-supported (FAST)',
  },
];

/**
 * Each station's default feed, chosen so the live channel matches the
 * station's own programming. Stations without an entry keep the native canvas
 * scene, which is why every station still works with the network offline.
 */
const STATION_FEEDS: Readonly<Record<string, string>> = {
  'smuve-one': 'stingray-greatest-hits',
  'producers-desk': 'stingray-focus',
  'neural-uplink': 'stingray-smooth-jazz',
  'sample-vault': 'stingray-hit-list',
  'beat-battle-arena': 'stingray-hip-hop-rnb',
  'arcade-after-dark': 'stingray-tiktok-radio',
  'tha-spot-live': 'red-bull-tv',
  'cinema-engine-one': 'stingray-movie-music',
  // Rain, neon, and a bad decision: the noir desk is fed film, not music.
  'noir-channel': 'midnight-pulp',
  'deep-focus': 'stingray-spa',
  'smuve-classics': 'stingray-everything-80s',
  'mastering-suite': 'stingray-peaceful-piano',
  'live-stage-88': 'stingray-qello-concerts',
  'news-desk': 'france24-en',
  'story-mode': 'tastemade',
  'the-making-of': 'red-bull-tv',
  // ── Sports ─────────────────────────────────────────────
  'smuve-sports': 'bein-sports-xtra',
  'game-day-feed': 'acc-digital-network',
  'endurance-tv': 'fuel-tv-emea',
  'track-day': 'floracing',
  // ── News ───────────────────────────────────────────────
  'world-news-now': 'trt-world',
  'asia-news-desk': 'cna-asia',
  'seoul-feed': 'arirang-tv',
  'wall-street-desk': 'bloomberg-tv',
  'europe-markets': 'bloomberg-eu',
  'asia-markets': 'bloomberg-asia',
  'the-german-desk': 'tagesschau',
  'global-desk': 'dw-arabic',
  'the-arabic-desk': 'aljazeera-arabic',
  'south-asia-live': 'ndtv-24x7',
  'cbs-news-feed': 'cbs-news-247',
  'the-weather-desk': 'accuweather-now',
  // ── Documentary ────────────────────────────────────────
  'history-vault': 'history-hit',
  'wild-earth': 'inwild',
  'the-blue-planet': 'love-the-planet',
  'wonder-lab': 'inwonder',
  'expedition': 'magellantv-now',
  'curious-mind': 'curiosity-now',
  'the-courtroom': 'court-tv',
  'true-crime-archive': 'inside-crime',
  // ── Music ──────────────────────────────────────────────
  // ── Sitcoms, Entertainment & Movies (the retuned dial) ──
  'prime-sitcoms': 'bet-tyler-perry-comedy',
  'family-sitcoms': 'dry-bar-comedy',
  'workplace-sitcoms': 'portlandia',
  'standup-spotlight': 'jfl-gags',
  'modern-movies': 'the-asylum',
  'feelgood-movies': 'lifetime-love-and-drama',
  'movie-marathon': 'gravitas-movies',
  'classic-drama': 'electricnow',
  'teen-drama': 'degrassi',
  'crime-series': 'acorn-mysteries',
  'reality-roundup': 'americas-got-talent',
  'game-night': 'deal-or-no-deal',
  'talent-stage': 'americas-got-talent',
  'pop-lifestyle': 'bon-appetit',
  // ── Movies & Cinema ────────────────────────────────────
  'movies-classic': 'shout-tv',
  // ── Comedy ─────────────────────────────────────────────
  'comedy-central': 'comedy-dynamics',
  'showtime-frasier': 'bbc-comedy',
  // ── Crime & Investigation ──────────────────────────────
  'the-first-48': 'first-48',
  // ── Cartoons ───────────────────────────────────────────
  'cartoon-network-classics': 'kartoon-channel',
  'retro-cartoons': 'retrocrush',
  // ── Black Cinema ───────────────────────────────────────
  'black-cinema-classics': 'maverick-black-cinema',
  // ── Series ─────────────────────────────────────────────
  'star-trek-tng': 'electricnow',
  // ── Vintage ────────────────────────────────────────────
  'vintage-classics': 'cw-gold',
  'game-show-classics': 'lets-make-a-deal-classic',
};

/**
 * One official destination for a record's complete version.
 *
 * No platform hands a browser a playable full-length stream for this catalogue,
 * so the record's full version is reached on the platform that publishes it.
 * The label is carried rather than assumed, so the station never implies it is
 * sending a listener somewhere it is not.
 */
export interface SmuveTvRadioLink {
  label: string;
  url: string;
}

/**
 * One track on Smuve Jeff Radio. Imported did-you-buy-it files and the official
 * previews share a shape so the radio queue can rotate through both without
 * caring where a track came from.
 */
export interface SmuveTvRadioTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** Playable audio URL, when the track has a hosted stream (Apple's previews). */
  url?: string;
  /**
   * Audio the artist supplied directly. Held as a Blob and turned into an
   * object URL at play time, so the queue never leaks a revoked URL.
   */
  blob?: Blob;
  /**
   * True when the station's own player would only ever be handed a clip.
   *
   * That covers both the ~30-second official preview Apple licenses for public
   * playback and a catalogue record nothing here can stream at all. Those two
   * are told apart by whether the track has any playable source: a record with
   * neither a hosted master nor a preview is listed and linked, never rotated.
   *
   * It deliberately says nothing about `youtubeId`: a record with an official
   * upload is heard complete through the artist's own player, not through this
   * one, so the flag keeps describing the station's own audio.
   */
  preview: boolean;
  /**
   * The record's true running time, even when only a preview streams. Apple's
   * catalogue reports it, so the channel can show `3:32` next to a 30-second
   * clip and never imply the clip is the whole record.
   */
  durationMs?: number;
  /** Release year, when the catalogue knows it. */
  year?: string;
  genre?: string;
  artworkUrl?: string;
  /** Public catalogue page, so a listener can go and hear the whole record. */
  linkUrl?: string;
  /**
   * Every official page where the COMPLETE record plays, free route first.
   *
   * `linkUrl` stays the single "open this record" destination; this is the
   * fuller set, and it is what carries the catalogue's reach: the records Apple
   * does not list have no other route to their full version at all.
   */
  links?: readonly SmuveTvRadioLink[];
  /**
   * Apple's track id, when this track came from the official catalogue. It is
   * the join key between a catalogue entry and a hosted full-length master, so
   * the two never appear as separate rows for the same record.
   */
  catalogId?: string;
  /**
   * The artist's own official upload of the COMPLETE record, when one exists.
   *
   * This is the catalogue's full-length source. Apple and Deezer license
   * 30-second clips, and no store hands a browser a full-length stream, but the
   * artist's own distributed uploads are whole records and are playable through
   * the platform's official player — so this is how a record the artist has
   * never uploaded to *this* station is still heard complete here.
   */
  youtubeId?: string;
}

/** One entry of `GET /api/music/masters` — a recording hosted for the station. */
export interface PublishedMasterRecord {
  id?: string;
  trackId?: number | null;
  title?: string;
  album?: string | null;
  /** Stored when the API records it; absent on older entries. */
  artist?: string | null;
  url?: string;
  publishedAt?: string;
}

/** One line of `assets/data/smuve-jeff-masters.json`. */
export interface SmuveJeffMasterEntry {
  trackId?: number;
  title?: string;
  album?: string;
  /**
   * Who the recording is credited to, when the source says.
   *
   * A hosted file with a credit that is not this artist's never reaches the
   * station: the radio plays Smuve Jeff and nothing else.
   */
  artist?: string;
  /** The artist's own full-length audio. Empty until they host it. */
  file?: string;
}

/**
 * One record of `assets/data/smuve-jeff-catalogue.json`.
 *
 * That file is the artist's complete official catalogue — 94 records, built by
 * `scripts/build-music-manifest.mjs` from Apple's catalogue API unioned with
 * Deezer's, because Apple alone lists 78 of them. The rest are on no Apple
 * store, so nothing that only queries Apple can ever surface them.
 */
export interface SmuveJeffCatalogueRecord {
  /** Stable id, namespaced by the source that first supplied the record. */
  id?: string;
  /** Apple's track id, when Apple carries this record. The master join key. */
  trackId?: number | null;
  title?: string;
  artist?: string;
  album?: string;
  year?: string | null;
  durationMs?: number | null;
  /** Apple's official 30-second preview, when Apple carries this record. */
  previewUrl?: string;
  artworkUrl?: string | null;
  /** Official pages where the complete record plays. */
  links?: readonly { label?: string; url?: string }[];
  /**
   * The artist's own official upload of the complete record.
   *
   * Built by `scripts/build-music-manifest.mjs` from the artist's YouTube
   * releases, so every record the internet can play whole carries its id here.
   */
  youtubeId?: string | null;
}

/**
 * Every key a hosted-master entry can be recognised by: its title and album
 * together, and its catalogue id when it has one.
 *
 * Both, not either — the committed manifest keys off Apple's track id while an
 * upload from the module is keyed by the name the artist gave the file, and the
 * same recording has to fold together whichever source it came from.
 */
function masterKeys(entry: SmuveJeffMasterEntry): string[] {
  const keys = [
    `${normalizeMatchKey(entry.title)}|${normalizeMatchKey(entry.album)}`,
  ];
  if (entry.trackId != null) keys.push(`id:${entry.trackId}`);
  return keys;
}

/**
 * Oldest release first, so the channel reads like a catalogue rather than a
 * jumble.
 *
 * A record with no known release date is not "the oldest record": an empty
 * string sorts ahead of every year, which would put an undated track at the
 * front of the rotation. It sinks to the end instead.
 */
function byReleaseOrder(a: SmuveTvRadioTrack, b: SmuveTvRadioTrack): number {
  const byYear = (a.year ?? '9999').localeCompare(b.year ?? '9999');
  if (byYear !== 0) return byYear;
  return a.album.localeCompare(b.album) || a.title.localeCompare(b.title);
}

/**
 * A small deterministic generator (mulberry32).
 *
 * Used to pin the rotation in tests. At runtime the component uses
 * `Math.random`, so the channel's order is genuinely unpredictable session to
 * session — this exists so the *rules* around that randomness can be proved.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One full pass through `items` in a random order.
 *
 * Fisher–Yates, not `sort(() => random() - 0.5)`: the comparator trick is
 * measurably biased toward the original order, which on a radio rotation means
 * the same records keep coming up early.
 */
export function shuffleBag<T>(items: readonly T[], random: () => number): T[] {
  const bag = [...items];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/** `m:ss` for a record's running time, or null when it is not known. */
export function trackLength(durationMs?: number): string | null {
  if (!durationMs || durationMs <= 0) return null;
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** Apple's public catalogue id for Smuve Jeff. */
const SMUVE_JEFF_ARTIST_ID = 1517179702;

const CATALOGUE_ENDPOINT = 'https://itunes.apple.com/lookup';
const CATALOGUE_TIMEOUT_MS = 12000;

/** Where the artist's full-length master manifest lives in the built app. */
export const MASTER_MANIFEST_PATH = 'assets/data/smuve-jeff-masters.json';

/** Where the complete official catalogue lives in the built app. */
export const CATALOGUE_PATH = 'assets/data/smuve-jeff-catalogue.json';

/** The app's own endpoint for hosted masters, relative to the API base. */
export const PUBLISHED_MASTERS_PATH = '/music/masters';

/** The file suffix for an audio MIME type, so the stored object is legible. */
export function audioExtension(type: string | undefined): string {
  switch ((type ?? '').split(';')[0].trim().toLowerCase()) {
    case 'audio/mpeg':
    case 'audio/mp3':
      return '.mp3';
    case 'audio/mp4':
    case 'audio/m4a':
    case 'audio/x-m4a':
    case 'audio/aac':
      return '.m4a';
    case 'audio/ogg':
      return '.ogg';
    case 'audio/wav':
    case 'audio/x-wav':
    case 'audio/wave':
      return '.wav';
    case 'audio/flac':
    case 'audio/x-flac':
      return '.flac';
    case 'audio/webm':
      return '.webm';
    default:
      // The object is served with its real content type, so an unknown suffix
      // costs nothing; a wrong one would.
      return '';
  }
}

/**
 * True when a credit belongs to this artist and nobody else.
 *
 * S.M.U.V.E Radio plays one artist, so this is the single rule every source is
 * held to: Apple's catalogue, the committed catalogue, the hosted-master
 * manifest, the published-master list, and the files imported in the module.
 * Feature credits still contain the artist's name, which is why this is a
 * containment test rather than equality — but a record credited to somebody
 * else is refused outright, however it arrived.
 */
export function isSmuveJeffArtist(artist: string | undefined | null): boolean {
  return (artist ?? '').toLowerCase().includes('smuve jeff');
}

/**
 * Folds the differences between a hand-written manifest and Apple's naming.
 *
 * Case and punctuation are dropped, and feature credits are removed, so
 * `Lost My Mind (feat. ChrisO)` and a typed `lost my mind` still find each
 * other. Remix and version markers are deliberately kept: `Got Away (Remix)` is
 * a different recording from `Got Away`, and quietly playing the wrong one
 * would be worse than leaving the record on its preview.
 */
export function normalizeMatchKey(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\((?:feat|ft|with)\.?[^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The subset of Apple's track payload this service reads. */
interface AppleTrack {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  releaseDate?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class SmuveTvFeedsService {
  readonly feeds = SMUVE_TV_LIVE_FEEDS;

  private readonly tokens = inject(TokenService);

  /** The station's default live feed, or null when it renders its own scene. */
  feedForStation(stationId: string): SmuveTvLiveFeed | null {
    return this.feedById(STATION_FEEDS[stationId] ?? '');
  }

  feedById(id: string): SmuveTvLiveFeed | null {
    if (!id) return null;
    return this.feeds.find((feed) => feed.id === id) ?? null;
  }

  feedsIn(genre: SmuveTvFeedGenre): SmuveTvLiveFeed[] {
    return this.feeds.filter((feed) => feed.genre === genre);
  }

  /**
   * The artist's official releases, straight from Apple's public catalogue.
   *
   * Text search on Apple's API only surfaces a handful of the artist's records,
   * so this reads the artist's catalogue by id, which is the complete release
   * list. The endpoint sends `Access-Control-Allow-Origin: *`, so the browser
   * can call it directly — no proxy and no key.
   *
   * Never throws: a blocked network or a changed payload resolves to an empty
   * list so the module keeps working and the UI states why.
   */
  async loadOfficialCatalogue(): Promise<SmuveTvRadioTrack[]> {
    if (typeof fetch !== 'function') return [];

    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), CATALOGUE_TIMEOUT_MS)
      : null;

    try {
      const url =
        `${CATALOGUE_ENDPOINT}?id=${SMUVE_JEFF_ARTIST_ID}` +
        '&entity=song&limit=200&country=US';
      const response = await fetch(url, controller ? { signal: controller.signal } : {});
      if (!response.ok) return [];
      const payload = (await response.json()) as { results?: AppleTrack[] };
      return this.normalizeCatalogue(payload?.results ?? []);
    } catch {
      return [];
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  /**
   * Reads the artist's full-length master manifest.
   *
   * Never throws: a missing or malformed manifest simply means nothing is
   * hosted yet, and the channel keeps playing the official previews.
   */
  async loadMasterManifest(): Promise<SmuveJeffMasterEntry[]> {
    if (typeof fetch !== 'function') return [];
    try {
      const response = await fetch(MASTER_MANIFEST_PATH);
      if (!response.ok) return [];
      const payload = (await response.json()) as { masters?: SmuveJeffMasterEntry[] };
      return Array.isArray(payload?.masters) ? payload.masters : [];
    } catch {
      return [];
    }
  }

  /**
   * The full-length recordings hosted through the app's own API.
   *
   * Returned in the committed manifest's shape so both join onto the catalogue
   * by exactly the same rules — there is no second matching path to keep honest.
   * Never throws: an unreachable API means nothing is hosted *here*, and the
   * station keeps playing the manifest that shipped with the build.
   */
  async loadPublishedMasters(): Promise<SmuveJeffMasterEntry[]> {
    if (typeof fetch !== 'function') return [];
    try {
      const response = await fetch(
        `${APP_SECURITY_CONFIG.api_url}${PUBLISHED_MASTERS_PATH}`
      );
      if (!response.ok) return [];
      const payload = (await response.json()) as {
        masters?: PublishedMasterRecord[];
      };
      return (Array.isArray(payload?.masters) ? payload.masters : [])
        .filter((entry) => Boolean(entry?.url))
        .map((entry) => ({
          trackId:
            typeof entry.trackId === 'number' ? entry.trackId : undefined,
          title: entry.title,
          album: entry.album ?? undefined,
          artist: entry.artist ?? undefined,
          file: entry.url as string,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Publishes one imported recording to the station.
   *
   * This is the difference between "plays in this browser" and "on air": an
   * import lives in this device's own storage, so it is the upload that puts a
   * full-length master on the channel everywhere and keeps it there.
   *
   * Throws with the API's own message when it refuses. A publish that silently
   * did nothing would leave the artist believing their record is on air
   * everywhere when it is only on the machine in front of them.
   */
  async publishMaster(track: SmuveTvRadioTrack): Promise<void> {
    const blob = track.blob;
    if (!blob) {
      throw new Error('Only a file imported here can be published.');
    }
    if (typeof fetch !== 'function' || typeof FormData !== 'function') {
      throw new Error('This browser cannot publish files.');
    }

    const body = new FormData();
    body.append('file', blob, `${track.title}${audioExtension(blob.type)}`);
    body.append('title', track.title);
    if (track.album) body.append('album', track.album);
    if (track.catalogId) body.append('trackId', track.catalogId);
    /*
     * The credit travels with the upload, so the stored master says whose
     * recording it is instead of leaving every reader to assume. The API holds
     * the same rule on its side and refuses anything credited elsewhere.
     */
    body.append('artist', track.artist);

    const token = this.tokens.jwtToken();
    const response = await fetch(
      `${APP_SECURITY_CONFIG.api_url}${PUBLISHED_MASTERS_PATH}`,
      {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      }
    );
    if (response.ok) return;

    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error ?? `The station refused the upload (${response.status}).`
    );
  }

  /**
   * One entry per record across every source of hosted audio.
   *
   * A record can legitimately be in both: the committed manifest ships with the
   * build, the API list is what the artist uploaded. Later sources win, and the
   * fold matches on track id *and* on title, so a record that is keyed by an
   * Apple id in one source and by its name in the other still becomes one
   * master rather than two.
   */
  mergeMasterSources(
    ...sources: readonly (readonly SmuveJeffMasterEntry[])[]
  ): SmuveJeffMasterEntry[] {
    const resolved: SmuveJeffMasterEntry[] = [];

    for (const source of sources) {
      for (const entry of source) {
        if (!entry?.file?.trim()) continue;
        const keys = masterKeys(entry);
        // Drop every earlier entry describing this record, however it happened
        // to be keyed: the loop is symmetric, so neither source has to be the
        // one that carries the track id.
        for (let index = resolved.length - 1; index >= 0; index -= 1) {
          if (masterKeys(resolved[index]).some((key) => keys.includes(key))) {
            resolved.splice(index, 1);
          }
        }
        resolved.push(entry);
      }
    }

    return resolved;
  }

  /**
   * Reads the committed catalogue of every official record.
   *
   * Never throws: a missing file degrades to the live Apple catalogue, which is
   * how the station worked before this file existed.
   */
  async loadCatalogueRecords(): Promise<SmuveJeffCatalogueRecord[]> {
    if (typeof fetch !== 'function') return [];
    try {
      const response = await fetch(CATALOGUE_PATH);
      if (!response.ok) return [];
      const payload = (await response.json()) as {
        records?: SmuveJeffCatalogueRecord[];
      };
      return Array.isArray(payload?.records) ? payload.records : [];
    } catch {
      return [];
    }
  }

  /**
   * The committed catalogue, refreshed with whatever Apple knows right now.
   *
   * The committed file is the base rather than a supplement, on purpose. It is
   * the only source holding the records Apple does not list at all — 16 of the
   * artist's 94 — and the Apple preview URLs it carries are the same long-lived
   * ones the API returns, so a blocked or reshaped Apple response costs
   * freshness instead of the catalogue. Live records are then laid over their
   * catalogue entry, and a record Apple has that the file has never seen (a
   * release newer than this build) is appended as-is, so a new single still
   * reaches the channel without regenerating anything.
   *
   * Pure, so the catalogue rules stay directly testable.
   */
  mergeCatalogue(
    records: readonly SmuveJeffCatalogueRecord[],
    live: readonly SmuveTvRadioTrack[]
  ): SmuveTvRadioTrack[] {
    const merged = new Map<string, SmuveTvRadioTrack>();
    const byCatalogId = new Map<string, SmuveTvRadioTrack>();
    const byTitleAlbum = new Map<string, SmuveTvRadioTrack>();
    const byUniqueTitle = new Map<string, SmuveTvRadioTrack | null>();

    records.forEach((record, index) => {
      const title = record.title?.trim();
      if (!title) return;
      // A catalogue file is a list of this artist's records. A line credited to
      // somebody else is not one of them, so it never reaches the radio even if
      // the file is edited by hand.
      const declared = record.artist?.trim();
      if (declared && !isSmuveJeffArtist(declared)) return;
      const track = this.catalogueTrack(record, index);
      merged.set(track.id, track);
      if (track.catalogId) byCatalogId.set(track.catalogId, track);
      byTitleAlbum.set(
        `${normalizeMatchKey(title)}|${normalizeMatchKey(record.album)}`,
        track
      );
      // A title that repeats in the catalogue is remembered as ambiguous, so it
      // is never used on its own to join two records that merely share a name.
      const titleKey = normalizeMatchKey(title);
      byUniqueTitle.set(titleKey, byUniqueTitle.has(titleKey) ? null : track);
    });

    for (const track of live) {
      const match =
        (track.catalogId ? byCatalogId.get(track.catalogId) : undefined) ??
        byTitleAlbum.get(
          `${normalizeMatchKey(track.title)}|${normalizeMatchKey(track.album)}`
        ) ??
        byUniqueTitle.get(normalizeMatchKey(track.title)) ??
        undefined;

      if (!match) {
        merged.set(track.id, track);
        continue;
      }

      match.url = track.url;
      match.durationMs = track.durationMs ?? match.durationMs;
      match.artworkUrl = track.artworkUrl ?? match.artworkUrl;
      match.linkUrl = track.linkUrl ?? match.linkUrl;
      match.year = track.year ?? match.year;
      match.genre = track.genre ?? match.genre;
      match.album = track.album || match.album;
    }

    return [...merged.values()].sort(byReleaseOrder);
  }

  /** One catalogue record as a station track: listed always, playable if it can be. */
  private catalogueTrack(
    record: SmuveJeffCatalogueRecord,
    index: number
  ): SmuveTvRadioTrack {
    const links = (record.links ?? [])
      .filter((link): link is { label?: string; url: string } => !!link.url)
      .map((link) => ({ label: link.label ?? 'OFFICIAL', url: link.url }));
    return {
        id:
          record.id?.trim() ||
          `catalogue-${normalizeMatchKey(record.title) || index}`,
        catalogId: record.trackId != null ? String(record.trackId) : undefined,
        title: record.title?.trim() || 'Untitled',
        // A record the file leaves uncredited is the artist's own; the one rule
        // that decides whether it plays is applied on the queue, not here.
        artist: record.artist?.trim() || 'Smuve Jeff',
      album: record.album?.trim() || 'Single',
      // Absent when Apple does not carry the record. That absence is the whole
      // distinction between a record the channel streams and one it only lists.
      url: record.previewUrl?.trim() || undefined,
      preview: true,
      durationMs: record.durationMs ?? undefined,
      year: record.year ?? undefined,
      artworkUrl: record.artworkUrl ?? undefined,
      linkUrl: links[0]?.url,
      links,
      // The complete recording, where the artist's own distribution put one.
      youtubeId: record.youtubeId?.trim() || undefined,
    };
  }

  /**
   * Attaches the artist's hosted recordings to the official catalogue.
   *
   * Matching is strict and ordered — track id, then title and album, then a
   * title that is unique in the catalogue — because attaching the wrong audio to
   * a record is worse than leaving that record on its preview. An entry that
   * matches nothing is still returned, so an unreleased recording the artist
   * hosts themselves is playable too.
   */
  matchMasters(
    catalogue: readonly SmuveTvRadioTrack[],
    entries: readonly SmuveJeffMasterEntry[],
    baseUrl = ''
  ): SmuveTvRadioTrack[] {
    const byCatalogId = new Map<string, SmuveTvRadioTrack>();
    const byTitleAlbum = new Map<string, SmuveTvRadioTrack>();
    const byUniqueTitle = new Map<string, SmuveTvRadioTrack>();
    const ambiguousTitles = new Set<string>();

    for (const track of catalogue) {
      if (track.catalogId) byCatalogId.set(track.catalogId, track);
      byTitleAlbum.set(
        `${normalizeMatchKey(track.title)}|${normalizeMatchKey(track.album)}`,
        track
      );
      const titleKey = normalizeMatchKey(track.title);
      if (byUniqueTitle.has(titleKey)) {
        ambiguousTitles.add(titleKey);
      } else {
        byUniqueTitle.set(titleKey, track);
      }
    }

    const resolved: SmuveTvRadioTrack[] = [];
    for (const entry of entries) {
      const file = entry.file?.trim();
      if (!file) continue;
      // One artist owns this station. A hosted file credited elsewhere is
      // skipped rather than relabelled as Smuve Jeff's own recording.
      if (entry.artist?.trim() && !isSmuveJeffArtist(entry.artist)) continue;

      const match =
        (entry.trackId != null
          ? byCatalogId.get(String(entry.trackId))
          : undefined) ??
        byTitleAlbum.get(
          `${normalizeMatchKey(entry.title)}|${normalizeMatchKey(entry.album)}`
        ) ??
        // Title-only matching is allowed only when the manifest gives no album
        // and the catalogue holds exactly one record by that name.
        (!entry.album
          ? (() => {
              const key = normalizeMatchKey(entry.title);
              return ambiguousTitles.has(key) ? undefined : byUniqueTitle.get(key);
            })()
          : undefined);

      resolved.push({
        id: match?.id ?? `master-${normalizeMatchKey(entry.title) || resolved.length}`,
        catalogId: match?.catalogId,
        title: match?.title ?? entry.title?.trim() ?? 'Untitled',
        artist: entry.artist?.trim() || match?.artist || 'Smuve Jeff',
        album: match?.album ?? entry.album?.trim() ?? 'Authorized master files',
        url: this.resolveFileUrl(file, baseUrl),
        preview: false,
        durationMs: match?.durationMs,
        year: match?.year,
        genre: match?.genre,
        artworkUrl: match?.artworkUrl,
        linkUrl: match?.linkUrl,
        // A hosted master still knows where the official upload lives, so the
        // record does not lose its full-length source by being hosted here.
        youtubeId: match?.youtubeId,
      });
    }
    return resolved;
  }

  /**
   * Absolute URLs are used exactly as written; anything else is resolved
   * against the app, so a same-origin `/assets/audio/…` path works on Render
   * without the artist having to know the deployment's hostname.
   */
  private resolveFileUrl(file: string, baseUrl: string): string {
    if (/^https?:\/\//i.test(file)) return file;
    const base =
      baseUrl || (typeof document !== 'undefined' ? document.baseURI : undefined);
    if (!base) return file;
    try {
      return new URL(file, base).toString();
    } catch {
      return file;
    }
  }

  /**
   * Reduces Apple's payload to the radio queue's shape.
   *
   * Pure, so the catalogue rules are directly testable: only real songs, only
   * those with playable audio, attributed to this artist alone, deduplicated by
   * track id, and ordered oldest-first so the station reads like a catalogue
   * rather than a jumble.
   */
  normalizeCatalogue(results: AppleTrack[]): SmuveTvRadioTrack[] {
    const byId = new Map<string, SmuveTvRadioTrack>();

    for (const entry of results) {
      if (entry.wrapperType !== 'track' || entry.kind !== 'song') continue;
      const audioUrl = entry.previewUrl;
      const title = entry.trackName?.trim();
      const artist = entry.artistName?.trim();
      if (!audioUrl || !title || !artist) continue;
      // A feature credit still contains the artist's name; a compilation
      // appearance that does not is somebody else's record.
      if (!isSmuveJeffArtist(artist)) continue;

      const id = String(entry.trackId ?? `${artist}-${title}`);
      if (byId.has(id)) continue;

      byId.set(id, {
        id: `apple-${id}`,
        catalogId: String(entry.trackId),
        title,
        artist,
        album: entry.collectionName?.trim() || 'Single',
        url: audioUrl,
        preview: true,
        durationMs: entry.trackTimeMillis,
        year: entry.releaseDate?.slice(0, 4),
        genre: entry.primaryGenreName,
        artworkUrl: entry.artworkUrl100,
        linkUrl: entry.trackViewUrl,
      });
    }

    return [...byId.values()].sort(byReleaseOrder);
  }
}
