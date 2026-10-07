import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  UNSAFE_useScrollRestoration as useScrollRestoration,
} from "react-router";

function SafeScrollRestoration() {
  useScrollRestoration();
  return null;
}

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
  { rel: "icon", type: "image/png", href: "/images/logo.png" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <header className="site-header">
          <div className="page-width header-inner">
            <Link className="brand" to="/" aria-label="3F Striders Events home">
              <img
                src="/images/logo.png"
                alt="3F Striders"
                className="brand-logo"
                width="44"
                height="44"
              />
              <span className="brand-text"><strong>STRIDERS</strong><small>EVENTS</small></span>
            </Link>
            <nav aria-label="Main navigation"><Link to="/">Events</Link><Link to="/dashboard">Athlete dashboard</Link><Link className="nav-organizer" to="/organizer">Organizer</Link></nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="page-width footer-inner">
            <div className="footer-brand">
              <img
                src="/images/logo.png"
                alt="3F Striders"
                className="footer-logo"
                width="32"
                height="32"
              />
              <span>© {new Date().getFullYear()} 3F Striders</span>
            </div>
            <span>Race registration built for the UAE</span>
          </div>
        </footer>
        <SafeScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
