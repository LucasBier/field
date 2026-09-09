export const NIA_MEDIA = [
  {
    id: 'window-v1',
    view: 'three-quarter',
    framing: 'waist-up',
    path: '/characters/nia-life-window-v1.png',
    title: 'By the window',
    description:
      'Nia smiling by a cafe window, in a navy jacket and ivory top.',
    sha256: 'c9ed4fe2106580d9677f94a8c6e7513e7cc1eb481d625b17b6024917e16965c8',
    bytes: 2081934,
  },
  {
    id: 'books-v1',
    view: 'three-quarter',
    framing: 'three-quarter-length',
    path: '/characters/nia-life-books-v1.png',
    title: 'Between the shelves',
    description:
      'Nia holding a closed book in a bookshop, wearing a plum sweater with an amused half-smile.',
    sha256: '949e8e35c241094c75c2f799a9d039e3ac9ed1945a643cf1cf1d92b7c6c47167',
    bytes: 2062349,
  },
  {
    id: 'evening-v1',
    view: 'over-shoulder',
    framing: 'chest-up',
    path: '/characters/nia-life-evening-v1.png',
    title: 'Blue hour',
    description:
      'Nia turning over her shoulder on a softly lit street at dusk, with a quiet smile.',
    sha256: '1e209b07181e38d9b8210dc7d7bcc6e92619decd8c41fc1dfb6fdb0aa65111dc',
    bytes: 2167101,
  },
  {
    id: 'full-standing-v1',
    path: '/characters/nia-life-full-standing-v1.png',
    title: 'In the courtyard',
    view: 'front',
    framing: 'full-length',
    description:
      'Full-length front-facing portrait of Nia standing relaxed in a courtyard, one hand in a pocket, in a navy jacket, ivory T-shirt, dark trousers and cream sneakers. Her hair and both shoes are fully in frame.',
    sha256: '78d59a7ae68ba89ae6018f05fd66141b5bba8a8e99374b9a6204980e65923d0c',
    bytes: 2091667,
  },
  {
    id: 'full-walk-v1',
    path: '/characters/nia-life-full-walk-v1.png',
    title: 'On the sidewalk',
    view: 'front',
    framing: 'full-length',
    description:
      'Full-length photograph of Nia walking toward the camera with a relaxed smile, her arms moving naturally. She wears a navy jacket, ivory T-shirt, dark trousers and cream sneakers; her whole figure and both shoes are visible.',
    sha256: 'c3cccd7d783b963526504397766db91c5873e2fde07b0aebffb2033a07f1deed',
    bytes: 2321596,
  },
] as const;
export type NiaMediaId = (typeof NIA_MEDIA)[number]['id'];
export function niaMedia(id: unknown) {
  return NIA_MEDIA.find((asset) => asset.id === id);
}
