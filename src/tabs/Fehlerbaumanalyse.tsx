import { FehlerbaumEditor } from '../fehlerbaum/FehlerbaumEditor'
import type { FaultTree } from '../fehlerbaum/model'

export function FehlerbaumanalyseTab({ tree, onChange }: { tree: FaultTree; onChange?: (tree: FaultTree) => void }) {
  return <FehlerbaumEditor tree={tree} onChange={onChange} />
}
