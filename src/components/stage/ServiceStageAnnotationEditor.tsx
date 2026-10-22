type Props = {
  draft: string
  published?: string
  disabled: boolean
  onChange: (value: string) => void
  onSave: () => void
  onClear: () => void
}

export function ServiceStageAnnotationEditor({ draft, published, disabled, onChange, onSave, onClear }: Props) {
  return (
    <section className="service-stage-annotation-editor" aria-label="Anotação do MD">
      <div><strong>Anotação da sessão</strong><span>{draft.length}/500</span></div>
      <textarea
        maxLength={500}
        value={draft}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ex.: ponte mais baixa, cortar bateria no refrão…"
        disabled={disabled}
      />
      <div>
        <span>Compartilhada com todos os músicos conectados.</span>
        <button type="button" onClick={onSave} disabled={disabled}>{published ? 'Atualizar nota' : 'Publicar nota'}</button>
        {published && <button type="button" onClick={onClear} disabled={disabled}>Limpar</button>}
      </div>
    </section>
  )
}
