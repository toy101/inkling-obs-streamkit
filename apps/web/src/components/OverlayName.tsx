import { useLayoutEffect, useRef } from "react";

type OverlayNameProps = {
  name: string;
  className: string;
  as?: "strong" | "h1" | "h2";
};

const FIT_CACHE_LIMIT = 8;

export function OverlayName({ name, className, as: Tag = "strong" }: OverlayNameProps) {
  const containerRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const fitCacheRef = useRef(new Map<string, string>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const cache = fitCacheRef.current;
    const fit = (observedWidth: number | null = null) => {
      const style = getComputedStyle(container);
      const availableWidth = observedWidth ?? (container.getBoundingClientRect().width -
        Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight) -
        Number.parseFloat(style.borderLeftWidth) - Number.parseFloat(style.borderRightWidth));
      if (availableWidth <= 0) return;

      const textStyle = getComputedStyle(text);
      const key = JSON.stringify([
        name, Tag, availableWidth, style.fontSize,
        textStyle.fontFamily, textStyle.fontWeight, textStyle.fontStyle,
        textStyle.fontStretch, textStyle.fontVariant, textStyle.fontFeatureSettings,
        textStyle.fontVariationSettings, textStyle.fontKerning, textStyle.fontOpticalSizing,
        textStyle.fontSizeAdjust, textStyle.letterSpacing, textStyle.wordSpacing,
        textStyle.textTransform, textStyle.textRendering, textStyle.direction,
      ]);
      if (cache.has(key)) {
        const cachedSize = cache.get(key) ?? "";
        if (text.style.fontSize !== cachedSize) text.style.fontSize = cachedSize;
        cache.delete(key);
        cache.set(key, cachedSize);
        return;
      }

      const remember = () => {
        cache.set(key, text.style.fontSize);
        if (cache.size > FIT_CACHE_LIMIT) {
          const oldest = cache.keys().next();
          if (!oldest.done) cache.delete(oldest.value);
        }
      };
      if (text.style.fontSize !== "") text.style.fontSize = "";
      let measuredWidth = text.getBoundingClientRect().width;
      if (measuredWidth <= availableWidth) {
        remember();
        return;
      }

      // Inherited letter spacing and fallback glyphs can make scaling non-linear.
      let fontSize = Number.parseFloat(style.fontSize);
      const targetWidth = Math.max(0, availableWidth - 0.5);
      let previousSize = fontSize;
      let previousWidth = measuredWidth;
      for (let step = 0; step < 3; step += 1) {
        const slope = (previousWidth - measuredWidth) / (previousSize - fontSize);
        const nextSize = Number.isFinite(slope) && slope > 0
          ? fontSize - (measuredWidth - targetWidth) / slope
          : fontSize * targetWidth / measuredWidth;
        previousSize = fontSize;
        previousWidth = measuredWidth;
        fontSize = Math.max(0, Math.min(fontSize, nextSize));
        text.style.fontSize = `${fontSize}px`;
        measuredWidth = text.getBoundingClientRect().width;
        if (measuredWidth <= availableWidth) {
          remember();
          return;
        }
      }

      // Retain a bounded fallback for font metrics that resist proportional fitting.
      let minimum = 0;
      let maximum = fontSize;
      for (let step = 0; step < 12; step += 1) {
        const fontSize = (minimum + maximum) / 2;
        text.style.fontSize = `${fontSize}px`;
        if (text.getBoundingClientRect().width <= availableWidth) {
          minimum = fontSize;
        } else {
          maximum = fontSize;
        }
      }
      text.style.fontSize = `${minimum}px`;
      remember();
    };

    fit();
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === container);
      if (entry) fit(entry.contentRect.width);
    });
    observer.observe(container);
    const fontsLoaded = () => {
      cache.clear();
      fit();
    };
    document.fonts.addEventListener("loadingdone", fontsLoaded);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fontsLoaded);
    };
  }, [name, Tag, className]);

  return (
    <Tag className={className} ref={(element: HTMLElement | null) => { containerRef.current = element; }}>
      <span className="overlay-name-text" ref={textRef}>
        {name}
      </span>
    </Tag>
  );
}
