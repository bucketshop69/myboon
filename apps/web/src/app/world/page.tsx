import NewsroomCanvas from '@/components/world/NewsroomCanvas'

export const metadata = {
  title: 'myboon // The Newsroom',
}

export default function WorldPage() {
  return (
    <div>
      <div className="text-center py-3 px-6 bg-surface-container text-on-surface-variant text-sm border-b border-outline-variant">
        The newsroom is now part of the{' '}
        <a href="/" className="text-primary underline">main page</a>.
        This standalone view will be removed in a future update.
      </div>
      <NewsroomCanvas />
    </div>
  )
}
