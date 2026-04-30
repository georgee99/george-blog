export const seedGuestbookData = {
  comments: [
    {
      commentId: '2026-01-01T00:00:00.000Z#guest-1',
      author: 'Alice',
      content: 'Love the blog, keep it up!',
      createdAt: new Date().toISOString(),
    },
    {
      commentId: '2026-01-01T00:00:01.000Z#guest-2',
      author: 'Bob',
      content: 'Found this via a friend. Great stuff.',
      createdAt: new Date().toISOString(),
    },
    {
      commentId: '2026-01-01T00:00:02.000Z#guest-3',
      author: 'Matt Murdock',
      content: 'This city needs me',
      createdAt: new Date().toISOString(),
    },
  ],
}

export const seedCommentData = {
  comments: [
    {
      commentId: '2026-01-01T00:00:00.000Z#seed-1',
      author: 'John Doe',
      content: 'Great post! Really enjoyed it.',
      createdAt: new Date().toISOString(),
      reactions: { '👍': 4, '❤️': 2 },
    },
    {
      commentId: '2026-01-01T00:00:01.000Z#seed-2',
      author: 'Jane Smith',
      content: 'Thanks for sharing your thoughts.',
      createdAt: new Date().toISOString(),
      reactions: { '👍': 1 },
    },
    {
      commentId: '2026-01-01T00:00:02.000Z#seed-3',
      author: 'George',
      content: 'Glad you liked it!',
      createdAt: new Date().toISOString(),
      parentId: '2026-01-01T00:00:00.000Z#seed-1',
      reactions: {},
    },
    {
      commentId: '2026-01-01T00:00:03.000Z#seed-4',
      author: 'Peter Parker',
      content: 'Man this post is amazing! Thanks for writing it.',
      createdAt: new Date().toISOString(),
      parentId: '2026-01-01T00:00:00.000Z#seed-1',
      reactions: { '❤️': 3, '😢': 1 },
    },
    {
      commentId: '2026-01-01T00:00:04.000Z#seed-5',
      author: 'Wilson Fisk',
      content: 'I am so impressed, I no longer feel the need to take over the city',
      createdAt: new Date().toISOString(),
      parentId: '2026-01-01T00:00:00.000Z#seed-1',
      reactions: { '😡': 2 },
    }
  ],
}