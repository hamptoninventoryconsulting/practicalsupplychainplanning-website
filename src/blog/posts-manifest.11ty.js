class PostsManifest {
  data() {
    return {
      permalink: "/blog/.posts.manifest.json",
      eleventyExcludeFromCollections: true,
    };
  }

  render(data) {
    const posts = (data.collections.postsByDate || []).map((post) => ({
      slug: post.fileSlug,
      title: post.data.title,
      summary: post.data.summary,
      published_datetime: post.data.published_datetime,
      featured_image_filename: post.data.featured_image,
      author: post.data.author,
      reading_time: post.data.reading_time,
    }));
    return `${JSON.stringify({ posts }, null, 2)}\n`;
  }
}

module.exports = PostsManifest;
