import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import InvoicePrint from "@/pages/InvoicePrint";
import PublicInvoice from "@/pages/PublicInvoice";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function Router() {
  return <Switch>
    <Route path="/pay/:token" component={PublicInvoice} />
    <Route path="/invoices/:id/print" component={InvoicePrint} />
    <Route path="/" component={Home} />
    <Route path="/invoices" component={Home} />
    <Route path="/quotes" component={Home} />
    <Route path="/customers" component={Home} />
    <Route path="/vendors" component={Home} />
    <Route path="/expenses" component={Home} />
    <Route path="/accounts" component={Home} />
    <Route path="/ledger" component={Home} />
    <Route path="/reports" component={Home} />
    <Route path="/assistant" component={Home} />
    <Route path="/settings" component={Home} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
