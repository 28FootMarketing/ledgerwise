import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { BookOpenText, Bot, ContactRound, FileBarChart2, FileText, Landmark, LayoutDashboard, LogOut, PanelLeft, ReceiptText, Settings2, UsersRound, ClipboardList } from "lucide-react";
import { CSSProperties, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  { icon: FileText, label: "Invoices", path: "/invoices" },
  { icon: ClipboardList, label: "Quotes", path: "/quotes" },
  { icon: UsersRound, label: "Customers", path: "/customers" },
  { icon: ContactRound, label: "Vendors", path: "/vendors" },
  { icon: ReceiptText, label: "Expenses", path: "/expenses" },
  { icon: Landmark, label: "Accounts", path: "/accounts" },
  { icon: BookOpenText, label: "Ledger", path: "/ledger" },
  { icon: FileBarChart2, label: "Reports", path: "/reports" },
  { icon: Bot, label: "Assistant", path: "/assistant" },
  { icon: Settings2, label: "Settings", path: "/settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem("ledgerwise-sidebar-width")) || 264);

  useEffect(() => localStorage.setItem("ledgerwise-sidebar-width", String(sidebarWidth)), [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#141414] px-6 text-white">
        <div className="relative w-full max-w-xl overflow-hidden border border-white/20 bg-[#1c1c1c] p-8 sm:p-12">
          <div className="absolute -right-16 -top-16 h-44 w-44 bg-white/10" />
          <p className="ledger-kicker">LEDGERWISE / SECURE WORKSPACE</p>
          <h1 className="mt-7 text-5xl font-black uppercase leading-[.88] tracking-[-.06em] sm:text-7xl">Know<br />the numbers.</h1>
          <p className="mt-7 max-w-md text-sm leading-6 text-white/60">Your accounting workspace is protected. Sign in to create invoices, record expenses, and read financial activity.</p>
          <Button onClick={() => startLogin()} className="mt-9 rounded-none bg-white px-6 font-bold uppercase tracking-[0.16em] text-black hover:bg-zinc-200">Sign in to continue</Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <LedgerNavigation sidebarWidth={sidebarWidth} setSidebarWidth={setSidebarWidth}>{children}</LedgerNavigation>
    </SidebarProvider>
  );
}

function LedgerNavigation({ children, sidebarWidth, setSidebarWidth }: { children: React.ReactNode; sidebarWidth: number; setSidebarWidth: (width: number) => void }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();
  const collapsed = state === "collapsed";
  const active = menuItems.find(item => item.path === location) ?? menuItems[0];

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-white/10 bg-[#171717] text-white">
        <SidebarHeader className="h-[84px] border-b border-white/10 px-4">
          <div className="flex h-full items-center gap-3 overflow-hidden">
            <button onClick={toggleSidebar} aria-label="Toggle navigation" className="grid h-9 w-9 shrink-0 place-items-center border border-white/15 text-white transition-colors hover:bg-white hover:text-black">
              <PanelLeft className="h-4 w-4" />
            </button>
            {!collapsed && <div className="min-w-0"><span className="block text-xl font-black uppercase tracking-[-.08em]">Ledger<br />Wise</span></div>}
          </div>
        </SidebarHeader>
        <SidebarContent className="bg-[#171717] px-2 py-4">
          <p className="ledger-kicker mb-3 px-3 text-white/35 group-data-[collapsible=icon]:hidden">FINANCE SYSTEM</p>
          <SidebarMenu className="gap-1">
            {menuItems.map(item => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton isActive={location === item.path} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-10 rounded-none text-zinc-400 transition-colors hover:bg-white hover:text-black data-[active=true]:bg-white data-[active=true]:text-black">
                  <item.icon className="h-4 w-4" />
                  <span className="font-medium">{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-white/10 bg-[#171717] p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 text-left outline-none">
                <Avatar className="h-9 w-9 rounded-none border border-white/20 bg-zinc-800 text-white"><AvatarFallback className="rounded-none bg-zinc-800 text-xs">{user?.name?.slice(0, 1).toUpperCase() ?? "U"}</AvatarFallback></Avatar>
                {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold">{user?.name ?? "Business owner"}</p><p className="truncate text-xs text-zinc-500">{user?.email ?? "Secure account"}</p></div>}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="rounded-none border-zinc-800 bg-zinc-950 text-white" align="end">
              <DropdownMenuItem onClick={logout} className="rounded-none text-white focus:bg-white focus:text-black"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-[#f1f1ef]">
        {isMobile && <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-black/10 bg-[#f1f1ef]/95 px-4 backdrop-blur"><div><p className="ledger-kicker">LEDGERWISE</p><p className="text-sm font-black uppercase">{active.label}</p></div><SidebarTrigger className="rounded-none border border-black/20" /></header>}
        <main className="min-h-screen p-4 sm:p-7 lg:p-9">{children}</main>
      </SidebarInset>
      {!collapsed && !isMobile && <div className="fixed bottom-8 left-[calc(var(--sidebar-width)-1px)] top-[84px] z-40 w-1 cursor-col-resize transition-colors hover:bg-white/30" onMouseDown={(event) => {
        const startX = event.clientX; const startWidth = sidebarWidth;
        const move = (moveEvent: MouseEvent) => setSidebarWidth(Math.min(340, Math.max(220, startWidth + moveEvent.clientX - startX)));
        const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
        window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
      }} />}
    </>
  );
}
