import './SkipLink.css'

/** RN-11: primeiro item da tabulação; leva o foco ao contêiner das rotas (`#conteudo`, em App.tsx). */
export function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#conteudo"
      onClick={(event) => {
        event.preventDefault()
        document.getElementById('conteudo')?.focus()
      }}
    >
      Pular para o conteúdo
    </a>
  )
}
