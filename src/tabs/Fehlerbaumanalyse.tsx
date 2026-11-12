import { FehlerbaumEditor } from '../fehlerbaum/FehlerbaumEditor'
import type { ComponentProps } from 'react'

export function FehlerbaumanalyseTab(props: ComponentProps<typeof FehlerbaumEditor>) {
  return <FehlerbaumEditor {...props} />
}
