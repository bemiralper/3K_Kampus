"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { LayoutGrid, CalendarDays, Users, Files, Bell, Presentation, BookOpen, ArrowUpRight, LogOut, Menu, X, MapPin, ChevronRight } from "lucide-react";
import { Initials } from "@/components/teacher/PortalUI";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/lib/contexts/AuthContext";
import { isTeacherPortalUser } from "@/lib/auth-routes";
import { activatePortal, portalHomePath } from "@/lib/profile-api";
import { TeacherProvider, useTeacher } from "@/lib/teacher-web";
import "./ogretmen.css";

const LINKS = [
  { href: "/ogretmen", label: "Genel bakış", icon: LayoutGrid },
  { href: "/ogretmen/program", label: "Ders programım", icon: CalendarDays },
  { href: "/ogretmen/notlar", label: "Ders notları", icon: Files },
  { href: "/ogretmen/siniflar", label: "Öğrencilerim", icon: Users },
  { href: "/ogretmen/konular", label: "Konu günlüğü", icon: BookOpen },
  { href: "/ogretmen/bildirimler", label: "Duyurular", icon: Bell },
  { href: "/ogretmen/tahta", label: "Akıllı tahta", icon: Presentation },
];

function current(pathname: string, href: string) {
  if (href === "/ogretmen") return pathname === "/ogretmen";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();
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
      if (window.innerWidth >= 1024) setNavOpen(false);
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
      <main className="tp-main tp-entry">
        <p className="tp-state">Portal açılıyor…</p>
      </main>
    );
  }
  if (error && !scope) {
    return (
      <main className="tp-main tp-entry">
        <p className="tp-error">{error}</p>
      </main>
    );
  }
  if (!scope) {
    return (
      <main className="tp-main tp-entry">
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
          <Menu size={22} /><span className="tp-sr-only">Menüyü aç</span>
        </button>
        <Link href="/ogretmen" className="tp-mobile-brand"><Image src="/img/3k-logo.png" alt="3K Kampüs" width={44} height={40} /><strong>Öğretmen alanı</strong></Link>
        <Link href="/ogretmen/bildirimler" className="tp-icon-button" aria-label="Duyurular"><Bell size={20} /></Link>
      </header>
      <button
        className="tp-backdrop"
        type="button"
        aria-label="Menüyü kapat"
        tabIndex={-1}
        onClick={() => setNavOpen(false)}
      />
      <aside className="tp-rail" id="ogretmen-menu" role={navOpen ? "dialog" : undefined} aria-modal={navOpen || undefined} aria-label="Öğretmen menüsü">
        <div className="tp-brand">
          <Link href="/ogretmen" aria-label="3K Kampüs ana sayfa"><Image src="/img/3k-logo.png" alt="3K Kampüs" width={58} height={52} priority /><div><strong>3K Kampüs</strong><span>ÖĞRETMEN ALANI</span></div></Link>
          <button ref={closeRef} className="tp-menu tp-menu-close" type="button" onClick={() => setNavOpen(false)}>
            <X size={20} /><span className="tp-sr-only">Kapat</span>
          </button>
        </div>
        <div className="tp-nav-caption">ÇALIŞMA ALANIM</div>
        <nav className="tp-nav" aria-label="Öğretmen">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} aria-current={current(pathname, link.href) ? "page" : undefined}>
              <link.icon size={19} strokeWidth={1.7} /><span>{link.label}</span>{current(pathname, link.href) && <ChevronRight size={15} className="tp-nav-arrow" />}
            </Link>
          ))}
        </nav>
        <Link className="tp-rail-promo" href="/ogretmen/notlar"><span className="tp-promo-icon"><Files size={22} /></span><strong>Bilgi paylaştıkça büyür.</strong><span>Ders notlarını tek bir yerde topla.</span><b>Materyallerime git <ArrowUpRight size={16} /></b></Link>
        <div className="tp-rail-foot">
          <div className="tp-profile"><Initials name={profileName} /><div><strong>{profileName || "Öğretmen"}</strong><span>{scope.subeAd}</span></div></div>
          {branches.length > 1 ? (
            <button type="button" onClick={() => { setNavOpen(false); clearScope(); }}>
              Şube değiştir
            </button>
          ) : null}
          {!isTeacherPortalUser(user)
            ? (user?.portals ?? []).map((portal) => (
                <button
                  key={portal.code}
                  type="button"
                  onClick={() => {
                    void activatePortal(portal.code).then((res) => {
                      if (res.success) window.location.assign(portalHomePath(portal.code));
                    });
                  }}
                >
                  {portal.label}
                </button>
              ))
            : null}
          <button
            type="button"
            onClick={() => {
              logout().then(() => router.push("/"));
            }}
          >
            <LogOut size={16} /> Güvenli çıkış
          </button>
        </div>
      </aside>
      <div className="tp-workspace">
        <div className="tp-desktop-header"><div><span>Çalışma alanım</span><ChevronRight size={13} /><strong>{pageLabel}</strong></div><div><span className="tp-context"><MapPin size={14} />{scope.subeAd}</span><span className="tp-term">{termName || scope.yilAd}</span><Link href="/ogretmen/bildirimler" className="tp-icon-button" aria-label="Duyurular"><Bell size={19} /></Link></div></div>
        <main className="tp-main" id="teacher-content">{error && <p role="alert" className="tp-error">{error}</p>}{children}</main>
        <footer className="tp-footer"><span>3K Kampüs · Öğretmen çalışma alanı</span><span>{scope.yilAd}</span></footer>
      </div>
      <nav className="tp-bottom-nav" aria-label="Hızlı gezinme">{LINKS.slice(0, 4).map(link => <Link key={link.href} href={link.href} aria-current={current(pathname, link.href) ? "page" : undefined}><link.icon size={21} strokeWidth={1.7} /><span>{link.label}</span></Link>)}</nav>
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
