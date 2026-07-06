import { redirect } from 'next/navigation'

export default function LegacyNewBlogRedirect() {
  redirect('/admin/blogs/new')
}
