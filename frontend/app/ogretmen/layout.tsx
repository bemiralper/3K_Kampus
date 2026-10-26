"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/lib/contexts/AuthContext";
import { TeacherProvider, useTeacher } from "@/lib/teacher-web";
import "./ogretmen.css";

const LINKS = [
  { href: "/ogretmen", label: "Bugün" },
  { href: "/ogretmen/program", label: "Program" },
  { href: "/ogretmen/siniflar", label: "Sınıflarım" },
  { href: "/ogretmen/konular", label: "Konular" },
  { href: "/ogretmen/bildirimler", label: "Bildirimler" },
  { href: "/ogretmen/tahta", label: "Tahta" },
];

function current(pathname: string, href: string) {
  if (href === "/ogretmen") return pathname === "/ogretmen";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const { scope, branches, yearNames, profileName, termName, loading, error, choose, clearScope } = useTeacher();
  const [navOpen, setNavOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    closeRef.current?.focus();
    const rail = document.getElementById("ogretmen-menu");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavOpen(false);
        return;
      }
      if (event.key !== "Tab" || !rail) return;
      const items = Array.from(rail.querySelectorAll<HTMLElement>("a, button"));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 840) setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      window.scrollTo(0, scrollY);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      menuRef.current?.focus();
    };
  }, [navOpen]);

  if (loading) {
    return (
      <main className="tp-main">
        <p className="tp-state">Portal açılıyor…</p>
      </main>
    );
  }
  if (error && !scope) {
    return (
      <main className="tp-main">
        <p className="tp-error">{error}</p>
      </main>
    );
  }
  if (!scope) {
    return (
      <main className="tp-main">
        <h1>Şube seçin</h1>
        <p className="tp-sub">Devam etmek için görevli olduğunuz şubeyi seçin.</p>
        {branches.length === 0 ? (
          <p className="tp-state">Bu hesapta öğretmen şubesi yok.</p>
        ) : (
          <div className="tp-grid">
            {branches.map((branch) => (
              <button key={`${branch.kurum_id}-${branch.id}-${branch.egitim_yili_id}`} className="tp-card" type="button" onClick={() => choose(branch)}>
                <strong>{branch.ad}</strong>
                <em>{yearNames[branch.egitim_yili_id] || "Eğitim yılı"}</em>
              </button>
            ))}
          </div>
        )}
      </main>
    );
  }

  const pageLabel = LINKS.find((link) => current(pathname, link.href))?.label
    || (pathname.startsWith("/ogretmen/ogrenci") ? "Öğrenci" : "Öğretmen");

  return (
    <div className={`tp-shell${navOpen ? " is-nav-open" : ""}`}>
      <header className="tp-topbar">
        <button
          ref={menuRef}
          className="tp-menu"
          type="button"
          aria-expanded={navOpen}
          aria-controls="ogretmen-menu"
          onClick={() => setNavOpen(true)}
        >
          Menü
        </button>
        <strong>{pageLabel}</strong>
      </header>
      <button
        className="tp-backdrop"
        type="button"
        aria-label="Menüyü kapat"
        tabIndex={-1}
        onClick={() => setNavOpen(false)}
      />
      <aside className="tp-rail" id="ogretmen-menu">
        <div className="tp-brand">
          <span>3K Kampüs</span>
          <button ref={closeRef} className="tp-menu tp-menu-close" type="button" onClick={() => setNavOpen(false)}>
            Kapat
          </button>
        </div>
        <nav className="tp-nav" aria-label="Öğretmen">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} aria-current={current(pathname, link.href) ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="tp-rail-foot">
          <span>{profileName || "Öğretmen"}</span>
          <span>{[scope.subeAd, termName].filter(Boolean).join(" · ")}</span>
          {branches.length > 1 ? (
            <button type="button" onClick={clearScope}>
              Şube değiştir
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              logout().then(() => router.push("/"));
            }}
          >
            Çıkış
          </button>
        </div>
      </aside>
      <main className="tp-main">{children}</main>
    </div>
  );
}

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <TeacherProvider>
      <Frame>{children}</Frame>
    </TeacherProvider>
  );
}
