import { Slide1ExecutiveOverview } from './Slide1ExecutiveOverview'
import { Slide2LearningHours } from './Slide2LearningHours'
import { Slide3InvestmentSplit } from './Slide3InvestmentSplit'
import { Slide4BUCharts } from './Slide4BUCharts'
import { Slide5BUProfiles } from './Slide5BUProfiles'
import { Slide6BUProfiles } from './Slide6BUProfiles'
import { Slide7CapabilityCoverage } from './Slide7CapabilityCoverage'
import { Slide8TalentMember } from './Slide8TalentMember'
import type { GroupAnalytics } from '@/lib/analytics'

export const SLIDE_TITLES = [
  'Executive Overview',
  'Learning Hours Delivered',
  'Where the Investment Goes',
  'Investment & Coverage by Business Unit',
  'Business Unit Profiles (Top 4)',
  'Business Unit Profiles (Remaining)',
  'Differentiating Capabilities Coverage',
  'Talent Member (TM) Trainings',
]

export const SLIDE_COUNT = SLIDE_TITLES.length

/** The report slides, in order — shared by the live slide viewer and the export panel. */
export function buildSlideNodes(data: GroupAnalytics, periodLabel: string): React.ReactNode[] {
  return [
    <Slide1ExecutiveOverview key="s1" data={data} pageNumber={1} periodLabel={periodLabel} />,
    <Slide2LearningHours key="s2" data={data} pageNumber={2} periodLabel={periodLabel} />,
    <Slide3InvestmentSplit key="s3" data={data} pageNumber={3} periodLabel={periodLabel} />,
    <Slide4BUCharts key="s4" data={data} pageNumber={4} periodLabel={periodLabel} />,
    <Slide5BUProfiles key="s5" data={data} pageNumber={5} periodLabel={periodLabel} />,
    <Slide6BUProfiles key="s6" data={data} pageNumber={6} periodLabel={periodLabel} />,
    <Slide7CapabilityCoverage key="s7" data={data} pageNumber={7} periodLabel={periodLabel} />,
    <Slide8TalentMember key="s8" data={data} pageNumber={8} periodLabel={periodLabel} />,
  ]
}
