export interface Command {
  id: string
  label: string
  run: () => void
}
