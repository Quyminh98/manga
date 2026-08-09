// StatusBar per spec.md section 7 ("Progress / status" footer strip).
export function StatusBar(): JSX.Element {
  return (
    <footer className="fixed bottom-0 right-0 w-full lg:w-[calc(100%-260px)] h-8 bg-surface-dim border-t border-border-subtle z-40 flex items-center justify-between px-margin-mobile lg:px-gutter">
      <div className="font-code-sm text-code-sm text-text-secondary">StoryPrompt Desktop v0.1.0</div>
      <div className="flex items-center gap-6 font-code-sm text-code-sm text-text-secondary">
        <span>No project running</span>
        <span>Vilao: Not configured</span>
      </div>
    </footer>
  )
}
