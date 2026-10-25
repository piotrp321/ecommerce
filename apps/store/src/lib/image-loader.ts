import type { ImageLoaderProps } from 'next/image';

// Images are resized by their CDN (Unsplash/imgix URL parameters), so the store server
// neither fetches nor stores them. Other sources are served as they are.
export default function imageLoader({ src, width, quality }: ImageLoaderProps): string {
  if (!src.startsWith('https://images.unsplash.com/')) return src;
  const url = new URL(src);
  url.searchParams.set('auto', 'format');
  url.searchParams.set('fit', 'crop');
  url.searchParams.set('w', String(width));
  url.searchParams.set('q', String(quality ?? 75));

  return url.toString();
}
