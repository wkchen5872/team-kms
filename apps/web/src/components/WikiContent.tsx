"use client";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import MermaidBlock from "./MermaidBlock";

const components: Components = {
  code(props) {
    const { className, children } = props;
    if (className === "language-mermaid") {
      return <MermaidBlock chart={String(children).replace(/\n$/, "")} />;
    }
    return <code className={className}>{children}</code>;
  },
};

export default function WikiContent({ content }: { content: string }) {
  return <ReactMarkdown components={components}>{content}</ReactMarkdown>;
}
