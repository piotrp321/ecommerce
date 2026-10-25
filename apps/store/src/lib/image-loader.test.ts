import imageLoader from './image-loader';

describe('imageLoader', () => {
  it('asks the Unsplash CDN for the requested width', () => {
    expect(imageLoader({ src: 'https://images.unsplash.com/photo-1', width: 640, quality: 80 })).toBe(
      'https://images.unsplash.com/photo-1?auto=format&fit=crop&w=640&q=80',
    );
  });

  it('leaves other sources unchanged', () => {
    expect(imageLoader({ src: '/logo.png', width: 640 })).toBe('/logo.png');
  });
});
