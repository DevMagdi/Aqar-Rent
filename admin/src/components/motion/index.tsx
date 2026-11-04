"use client";

import {
  Children,
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";

export function useReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.js = "true";
    const setHidden = () => root.toggleAttribute("data-hidden", document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", setHidden, { passive: true });
    setHidden();
    const element = ref.current;
    if (!element) {
      setRevealed(true);
      return () => document.removeEventListener("visibilitychange", setHidden);
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      setRevealed(true);
      return () => document.removeEventListener("visibilitychange", setHidden);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      // Pre-reveal just below the fold so full-page mobile sections do not appear as blank blocks.
      { threshold: 0.15, rootMargin: "0px 0px 160px 0px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", setHidden);
    };
  }, []);

  return { ref, revealed };
}

export interface RevealProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  delay?: number;
  children: ReactNode;
}

export function Reveal({ as = "div", delay = 0, className = "", style, children, ...props }: RevealProps) {
  const { ref, revealed } = useReveal<HTMLElement>();
  const revealStyle = {
    ...style,
    "--reveal-delay": `${Math.max(0, Math.min(480, delay))}ms`,
  } as CSSProperties;
  return createElement(
    as,
    {
      ...props,
      ref,
      className: `reveal ${className}`.trim(),
      style: revealStyle,
      "data-revealed": revealed ? "true" : "false",
    },
    children,
  );
}

export interface StaggerProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  as?: ElementType;
  children: ReactNode;
  delay?: number;
}

export function Stagger({ as = "div", className = "", children, delay = 0, ...props }: StaggerProps) {
  const indexed = Children.map(children, (child, index) => (
    <div
      className="stagger-item"
      data-staggered={index < 8 ? "true" : "false"}
      style={{ "--i": index < 8 ? index : 0, "--stagger-base": `${Math.max(0, delay)}ms` } as CSSProperties}
    >
      {child}
    </div>
  ));
  return <Reveal as={as} {...props} className={`reveal-stagger ${className}`}>{indexed}</Reveal>;
}

export interface CountUpProps {
  value: number | string;
  locale?: "ar" | "en";
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}

export function CountUp({ value, locale = "en", suffix = "", decimals = 0, duration = 900, className = "" }: CountUpProps) {
  const raw = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
  const target = Number.isFinite(raw) ? raw : 0;
  const formatter = useMemo(() => new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }), [decimals, locale]);
  const finalText = useMemo(() => `${formatter.format(target)}${suffix}`, [formatter, suffix, target]);
  const { ref, revealed } = useReveal<HTMLElement>();
  const [current, setCurrent] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!revealed) return;
    if (reducedMotion || duration <= 0) {
      setCurrent(target);
      return;
    }
    let frame = 0;
    let start = 0;
    const run = (time: number) => {
      if (!start) start = time;
      const progress = Math.min(1, (time - start) / Math.min(duration, 900));
      const eased = 1 - Math.pow(1 - progress, 4);
      setCurrent(target * eased);
      if (progress < 1) frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [duration, reducedMotion, revealed, target]);

  const numberText = !revealed || reducedMotion
    ? finalText
    : `${formatter.format(current)}${suffix}`;
  return createElement("span", { ref, className: `reveal count-up ${className}`.trim(), "aria-label": finalText, "data-revealed": revealed ? "true" : "false" }, numberText);
}

export function AnimatedPresence({ present, children, className = "" }: { present: boolean; children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(present);
  const [rendered, setRendered] = useState<ReactNode>(children);
  if (present && rendered !== children) setRendered(children);
  const [phase, setPhase] = useState<"enter" | "exit">("enter");
  useEffect(() => {
    if (present) {
      setMounted(true);
      setPhase("enter");
      return;
    }
    setPhase("exit");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(() => setMounted(false), reduced ? 0 : 140);
    return () => window.clearTimeout(id);
  }, [present]);
  if (!mounted) return null;
  return <div className={`animated-presence ${className}`.trim()} data-presence={present ? phase : "exit"}>{rendered}</div>;
}
