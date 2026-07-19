/**
 * Markdown — renders agent output (assistant messages, finding descriptions)
 * as GitHub-flavored markdown, sized to the panel's compact text scale.
 *
 * Agent output is untrusted model text: raw HTML is deliberately NOT rendered
 * (react-markdown's default — no `rehype-raw` here, ever) and links open in a
 * new tab with `rel="noopener noreferrer"`.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
}

export function Markdown({ content }: Props) {
  return (
    <div className="agent-markdown min-w-0 break-words [&>*+*]:mt-1.5 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-xs [&_h2]:font-semibold [&_h3]:text-xs [&_h3]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-4 [&_ol]:pl-4 [&_li+li]:mt-0.5 [&_code]:rounded [&_code]:bg-[var(--color-bg-surface)] [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[11px] [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-[var(--color-bg-surface)] [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--color-border-strong)] [&_blockquote]:pl-2 [&_blockquote]:text-[var(--color-fg-secondary)] [&_table]:block [&_table]:overflow-x-auto [&_th]:border [&_th]:border-[var(--color-border)] [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:text-left [&_td]:border [&_td]:border-[var(--color-border)] [&_td]:px-1.5 [&_td]:py-0.5 [&_a]:text-[var(--color-accent)] [&_a]:underline [&_hr]:border-[var(--color-border)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
