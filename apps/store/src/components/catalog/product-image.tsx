import { ImageOff } from 'lucide-react';
import Image from 'next/image';
import type { CatalogImage } from '@/catalog/types';
import { cn } from '@/lib/utils';

interface ProductImageProps {
  image: CatalogImage | null;
  sizes: string;
  className?: string;
  imageClassName?: string;
  /** `eager` for images in the first viewport, `preload` for the page's main (LCP) image. */
  loading?: 'lazy' | 'eager' | 'preload';
}

/** Fills its (relatively positioned) container; a neutral placeholder when there is no photo. */
export function ProductImage({ image, sizes, className, imageClassName, loading = 'lazy' }: ProductImageProps) {
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {image ? (
        <Image
          src={image.url}
          alt={image.alt}
          fill
          sizes={sizes}
          {...(loading === 'preload' ? { preload: true } : { loading })}
          className={cn('object-cover', imageClassName)}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <ImageOff className="size-8" aria-hidden="true" />
          <span className="text-xs">Brak zdjęcia</span>
        </div>
      )}
    </div>
  );
}
