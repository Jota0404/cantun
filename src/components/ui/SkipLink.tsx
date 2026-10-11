import './SkipLink.css'

/** RN-11: primeiro item da tabulação; leva o foco ao `<main>` da página atual. */
export function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#conteudo"
      onClick={(event) => {
        event.preventDefault()
        const main = document.querySelector('main')
        if (!main) return
        main.setAttribute('tabindex', '-1')
        main.focus()
      }}
    >
      Pular para o conteúdo
    </a>
  )
}
