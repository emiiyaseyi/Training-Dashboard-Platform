// One-off, manually-run data load for the Training Catalog (see TrainingCatalogCourse in
// schema.prisma and the plan this came from) — NOT part of the app's runtime, never imported
// elsewhere. Run once with `npx tsx prisma/seed-training-catalog.ts` against whichever DATABASE_URL
// is active. Safe to re-run: upserts by (title, provider) rather than blindly inserting, so running
// it again after the source data file is edited just updates existing rows and adds new ones.
//
// Source: prisma/training-catalog-seed-data.json — 993 courses extracted from 7 providers' 2026
// calendars (NIM, Lagos Business School, PwC Nigeria Finance Academy, PwC Nigeria Business School,
// POISE Nigeria, FITC, Phillips Consulting), each tagged against the same ROLE_RESPONSIBILITY_
// CATEGORIES / DEVELOPMENT_DRIVER_OPTIONS / BUSINESS_OUTCOME_OPTIONS taxonomies pdp-seed.ts uses,
// so the PDP's "Proposed Training Title" matching has something real to score against from day one.
// This is an approximation (tags assigned from title/category text), not a perfect classification —
// review and adjust via Admin -> Taxonomies -> Training Catalog as needed. PCL's international/
// overseas programmes (Cambridge, Howard, UCL, Georgia, Pretoria, Doha, London) were deliberately
// excluded — this catalog covers local Nigerian deliveries only, per the "local trainings only" scope.
import { PrismaClient } from '@prisma/client'
import data from './training-catalog-seed-data.json'

const prisma = new PrismaClient()

interface SeedCourse {
  title: string
  provider: string
  category: string | null
  tags: string[]
  durationLabel: string | null
}

async function main() {
  const courses = data as SeedCourse[]
  let created = 0
  let updated = 0

  for (const course of courses) {
    const existing = await prisma.trainingCatalogCourse.findFirst({
      where: { title: course.title, provider: course.provider },
      select: { id: true },
    })
    const payload = {
      title: course.title,
      provider: course.provider,
      category: course.category,
      tags: JSON.stringify(course.tags),
      durationLabel: course.durationLabel,
    }
    if (existing) {
      await prisma.trainingCatalogCourse.update({ where: { id: existing.id }, data: payload })
      updated++
    } else {
      await prisma.trainingCatalogCourse.create({ data: payload })
      created++
    }
  }

  console.log(`Training Catalog seed complete — ${created} created, ${updated} updated, ${courses.length} total.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
