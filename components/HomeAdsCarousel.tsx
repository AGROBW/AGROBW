import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLayout } from '../src/contexts/LayoutContext';

interface HomeAdsCarouselProps<T> {
  title: string;
  subtitle: string;
  items: T[];
  isLoading?: boolean;
  emptyMessage: string;
  skeletonCount?: number;
  eyebrow?: string;
  centeredHeader?: boolean;
  headerAction?: React.ReactNode;
  sectionClassName?: string;
  sectionStyle?: React.CSSProperties;
  footer?: React.ReactNode;
  renderItem: (item: T, index: number) => React.ReactNode;
}

const getItemsPerView = () => {
  if (typeof window === 'undefined') return 4;
  if (window.innerWidth >= 1024) return 4;
  if (window.innerWidth >= 640) return 2;
  return 1;
};

function HomeAdsCarousel<T>({
  title,
  subtitle,
  items,
  isLoading = false,
  emptyMessage,
  skeletonCount = 4,
  eyebrow,
  centeredHeader = false,
  headerAction,
  sectionClassName = '',
  sectionStyle,
  footer,
  renderItem,
}: HomeAdsCarouselProps<T>) {
  const { settings } = useLayout();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [itemsPerView, setItemsPerView] = useState(getItemsPerView);
  const [activePage, setActivePage] = useState(0);

  const maxPage = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.max(0, Math.ceil(items.length / itemsPerView) - 1);
  }, [items.length, itemsPerView]);

  const showControls = items.length > itemsPerView;

  useEffect(() => {
    const handleResize = () => {
      setItemsPerView(getItemsPerView());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (activePage > maxPage) {
      setActivePage(maxPage);
    }
  }, [activePage, maxPage]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const handleScroll = () => {
      const trackLeft = track.getBoundingClientRect().left;
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      itemRefs.current.forEach((item, index) => {
        if (!item) return;
        const distance = Math.abs(item.getBoundingClientRect().left - trackLeft);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      setActivePage(Math.min(maxPage, Math.floor(nearestIndex / itemsPerView)));
    };

    track.addEventListener('scroll', handleScroll, { passive: true });
    return () => track.removeEventListener('scroll', handleScroll);
  }, [itemsPerView, maxPage]);

  const scrollToPage = (page: number) => {
    const clampedPage = Math.max(0, Math.min(page, maxPage));
    const targetIndex = clampedPage * itemsPerView;
    const target = itemRefs.current[targetIndex];

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
      setActivePage(clampedPage);
    }
  };

  return (
    <section className={sectionClassName} style={sectionStyle}>
      <div className="max-w-7xl mx-auto px-4">
        <div className={`mb-10 flex flex-col gap-4 ${centeredHeader ? 'items-center text-center' : 'md:flex-row md:items-center md:justify-between'}`}>
          <div>
            {eyebrow ? (
              <span
                className="mb-3 inline-block rounded-lg px-3 py-1 text-[10px] font-semibold uppercase tracking-widest"
                style={{
                  backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 12%, white)`,
                  color: settings.primaryColor,
                }}
              >
                {eyebrow}
              </span>
            ) : null}
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
          </div>

          <div className={`flex items-center gap-3 ${centeredHeader ? 'justify-center' : 'md:justify-end'}`}>
            {headerAction}
            {showControls ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => scrollToPage(activePage - 1)}
                  disabled={activePage === 0}
                  className="rounded-xl border p-2.5 shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-100"
                  style={{
                    color: activePage === 0 ? '#94a3b8' : settings.primaryColor,
                    backgroundColor: activePage === 0 ? '#f8fafc' : 'white',
                    borderColor: activePage === 0 ? '#e2e8f0' : settings.primaryColor,
                    boxShadow:
                      activePage === 0
                        ? '0 1px 2px rgba(15, 23, 42, 0.04)'
                        : `0 10px 24px -16px ${settings.primaryColor}66`,
                  }}
                >
                  <ChevronLeft className="w-4 h-4" strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollToPage(activePage + 1)}
                  disabled={activePage >= maxPage}
                  className="rounded-xl border p-2.5 shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-100"
                  style={{
                    color: activePage >= maxPage ? '#94a3b8' : settings.primaryColor,
                    backgroundColor: activePage >= maxPage ? '#f8fafc' : 'white',
                    borderColor: activePage >= maxPage ? '#e2e8f0' : settings.primaryColor,
                    boxShadow:
                      activePage >= maxPage
                        ? '0 1px 2px rgba(15, 23, 42, 0.04)'
                        : `0 10px 24px -16px ${settings.primaryColor}66`,
                  }}
                >
                  <ChevronRight className="w-4 h-4" strokeWidth={2.4} />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: skeletonCount }).map((_, index) => (
              <div
                key={`carousel-skeleton-${index}`}
                className="h-72 shrink-0 basis-[calc(100%-1rem)] animate-pulse rounded-xl border border-slate-100 bg-white sm:basis-[calc(50%-0.5rem)] lg:basis-[calc(25%-0.75rem)]"
              />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div
            ref={trackRef}
            className="flex gap-4 overflow-x-auto scroll-smooth pb-2 snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {items.map((item, index) => (
              <div
                key={index}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                className="min-w-0 shrink-0 snap-start basis-[calc(100%-1rem)] sm:basis-[calc(50%-0.5rem)] lg:basis-[calc(25%-0.75rem)]"
              >
                {renderItem(item, index)}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-100 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">{emptyMessage}</p>
          </div>
        )}

        {footer ? <div className="mt-10 text-center">{footer}</div> : null}
      </div>
    </section>
  );
}

export default HomeAdsCarousel;
