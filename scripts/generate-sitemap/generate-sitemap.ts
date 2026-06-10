/**
 * generate-sitemap.ts
 *
 * Generates sitemap.xml for all blog posts and static pages.
 * Run: npm run generate-sitemap
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import matter from 'gray-matter'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Config
const POSTS_DIR = path.join(__dirname, '../../content/posts')
const OUTPUT_PATH = path.join(__dirname, '../../public/sitemap.xml')
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://georgeelz.blog'

// Static pages with priority and change frequency
const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: 1.0 },
  { path: '/blog', changefreq: 'daily', priority: 0.9 },
  { path: '/ask', changefreq: 'weekly', priority: 0.7 },
  { path: '/guestbook', changefreq: 'weekly', priority: 0.7 },
]

interface Post {
  slug: string
  date: string
  lastmod?: string
}

/**
 * Read all published posts from content/posts/
 */
function getAllPosts(): Post[] {
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.mdx'))
  const posts: Post[] = []

  for (const file of files) {
    const filePath = path.join(POSTS_DIR, file)
    const content = fs.readFileSync(filePath, 'utf-8')
    const { data } = matter(content)

    // Only include published posts
    if (data.published === false) {
      continue
    }

    const slug = file.replace(/\.mdx$/, '')
    const date = data.date ? new Date(data.date).toISOString() : new Date().toISOString()
    
    posts.push({
      slug,
      date,
      lastmod: data.lastmod || date,
    })
  }

  return posts
}

/**
 * Generate sitemap XML
 */
function generateSitemap(posts: Post[]): string {
  const now = new Date().toISOString()

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'

  // Add static pages
  for (const page of STATIC_PAGES) {
    xml += '  <url>\n'
    xml += `    <loc>${SITE_URL}${page.path}</loc>\n`
    xml += `    <lastmod>${now}</lastmod>\n`
    xml += `    <changefreq>${page.changefreq}</changefreq>\n`
    xml += `    <priority>${page.priority}</priority>\n`
    xml += '  </url>\n'
  }

  // Add blog posts (sorted by date, newest first)
  const sortedPosts = posts.sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  for (const post of sortedPosts) {
    xml += '  <url>\n'
    xml += `    <loc>${SITE_URL}/blog/${post.slug}</loc>\n`
    xml += `    <lastmod>${post.lastmod}</lastmod>\n`
    xml += `    <changefreq>monthly</changefreq>\n`
    xml += `    <priority>0.8</priority>\n`
    xml += '  </url>\n'
  }

  xml += '</urlset>\n'
  return xml
}

/**
 * Main
 */
function main() {
  console.log('🗺️  Generating sitemap...')
  console.log(`📍 Site URL: ${SITE_URL}`)

  // Read all posts
  const posts = getAllPosts()
  console.log(`📝 Found ${posts.length} published posts`)

  // Generate sitemap XML
  const xml = generateSitemap(posts)

  // Ensure public/ directory exists
  const publicDir = path.dirname(OUTPUT_PATH)
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true })
  }

  // Write sitemap.xml
  fs.writeFileSync(OUTPUT_PATH, xml, 'utf-8')
  console.log(`✅ Sitemap written to ${OUTPUT_PATH}`)
  console.log(`📊 Total URLs: ${STATIC_PAGES.length + posts.length}`)
  console.log(`\n🌐 Access at: ${SITE_URL}/sitemap.xml`)
}

main()
