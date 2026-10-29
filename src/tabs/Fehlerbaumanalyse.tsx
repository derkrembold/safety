import { FehlerbaumEditor } from '../fehlerbaum/FehlerbaumEditor'
import type { FaultTree } from '../fehlerbaum/model'

export function FehlerbaumanalyseTab({ tree }: { tree: FaultTree }) {
  return <FehlerbaumEditor tree={tree} />
}
