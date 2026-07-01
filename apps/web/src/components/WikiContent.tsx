"use client";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import MermaidBlock from "./MermaidBlock";

// Wiki links Claude writes use VaultFS paths (e.g. /wiki/entities/foo.md), which are
// NOT real Next.js routes. Resolve them in-page via onNavigate instead of navigating.
export default function WikiContent({
  content,
  onNavigate,
}: {
  content: string;
  onNavigate?: (href: string) => boolean;
}) {
  const components: Components = {
    code(props) {
      const { className, children } = props;
      if (className === "language-mermaid") {
        return <MermaidBlock chart={String(children).replace(/\n$/, "")} />;
      }
      return <code className={className}>{children}</code>;
    },
    a(props) {
      const { href, children } = props;
      if (href && href.startsWith("/") && onNavigate) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              const ok = onNavigate(href);
              if (!ok) console.warn(`[wiki] dangling link: ${href}`);
            }}
          >
            {children}
          </a>
        );
      }
      const external = href?.startsWith("http");
      return (
        <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
          {children}
        </a>
      );
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkFrontmatter]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
