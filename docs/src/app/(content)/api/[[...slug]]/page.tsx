import type { TOCItemType } from 'fumadocs-core/toc'
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LetsTalkWidget } from '@/components/lets-talk-widget'
import { PlatformPills } from '@/components/platform/pills'
import { getApiCodeTypeLinks } from '@/lib/api-code-links'
import { createApiRelativeLink } from '@/lib/api-relative-link'
import { extractTextFromNode } from '@/lib/mdx/utils'
import {
  normalizeHeadingTitle,
  readPlatformsFromPageData,
  readTocPlatformsByHeadingFromPageData,
} from '@/lib/platforms'
import { getOgImage, siteConfig } from '@/lib/site-config'
import { apiSource } from '@/lib/source'
import { getMDXComponents } from '@/mdx-components'

function trimApiTocDepth(
  toc: TOCItemType[] | undefined,
  maxDepth: number,
): TOCItemType[] | undefined {
  if (toc == null) {
    return undefined
  }

  return toc.filter((item) => item.depth <= maxDepth)
}

function getTocItemTitleText(title: TOCItemType['title']): string | null {
  return normalizeHeadingTitle(extractTextFromNode(title))
}

function withApiPlatformTocPills(
  toc: TOCItemType[] | undefined,
  platformsByHeading: Record<string, string[]>,
): TOCItemType[] | undefined {
  if (toc == null || Object.keys(platformsByHeading).length === 0) {
    return toc
  }

  return toc.map((item) => {
    const title = getTocItemTitleText(item.title)
    if (title == null) {
      return item
    }

    const platforms = platformsByHeading[title]
    if (platforms == null || platforms.length === 0) {
      return item
    }

    return {
      ...item,
      title: (
        <span className="api-toc-item-title">
          <span>{title}</span>
          {platforms.map((platform) => (
            <span key={platform} className="api-toc-platform-pill">
              {platform}
            </span>
          ))}
        </span>
      ),
    }
  })
}

function ApiTocFooterOnly() {
  return (
    <div
      id="nd-toc"
      className="sticky top-(--fd-docs-row-1) h-[calc(var(--fd-docs-height)-var(--fd-docs-row-1))] flex flex-col [grid-area:toc] w-(--fd-toc-width) pe-4 pb-2 xl:layout:[--fd-toc-width:268px] max-xl:hidden"
    >
      <LetsTalkWidget className="mt-0" />
    </div>
  )
}

async function resolveApiPage(params: PageProps<'/api/[[...slug]]'>['params']) {
  const { slug } = await params
  const page = apiSource.getPage(slug)
  if (page != null) {
    return page
  }

  notFound()
}

export default async function Page(props: PageProps<'/api/[[...slug]]'>) {
  const page = await resolveApiPage(props.params)

  const MDX = page.data.body
  const platforms = readPlatformsFromPageData(page.data)
  const tocPlatforms = readTocPlatformsByHeadingFromPageData(page.data)
  const toc = withApiPlatformTocPills(
    trimApiTocDepth(page.data.toc, 3),
    tocPlatforms,
  )
  const hasToc = toc != null && toc.length > 0
  const codeTypeLinks = getApiCodeTypeLinks(page.slugs[0] ?? '')
  const currentTypeName = page.slugs[2]

  return (
    <DocsPage
      toc={toc}
      full={page.data.full}
      tableOfContent={
        hasToc
          ? { footer: <LetsTalkWidget /> }
          : { enabled: true, component: <ApiTocFooterOnly /> }
      }
    >
      <DocsTitle className="m-0 text-4xl md:text-5xl tracking-tight break-words [overflow-wrap:anywhere]">
        {page.data.title}
      </DocsTitle>
      <PlatformPills platforms={platforms} />
      {/* Description is used for meta tags and og:image only;
          the body already contains the full summary text. */}
      <DocsBody className="[&>*:first-child]:mt-0.5 prose-lg prose-h3:text-2xl prose-h3:leading-tight">
        <MDX
          components={getMDXComponents(
            {
              a: createApiRelativeLink(apiSource, page),
            },
            {
              codeTypeLinks,
              currentTypeName,
              headingPlatforms: tocPlatforms,
              codeBlock: {
                viewportClassName: 'text-sm',
              },
            },
          )}
        />
      </DocsBody>
    </DocsPage>
  )
}

export async function generateStaticParams() {
  return apiSource.generateParams()
}

export async function generateMetadata(
  props: PageProps<'/api/[[...slug]]'>,
): Promise<Metadata> {
  const page = await resolveApiPage(props.params)
  const description = page.data.description?.trim()

  const image = getOgImage(page.url)

  return {
    title: page.data.title,
    ...(description != null && description.length > 0 ? { description } : {}),
    alternates: {
      canonical: page.url,
    },
    openGraph: {
      siteName: siteConfig.name,
      url: page.url,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      images: [image],
    },
  }
}
