source 'https://rubygems.org'

gem 'jekyll', '>= 3.6.3'

# Pin ffi to the last 1.15.x release (newer versions require Ruby >= 3.0).
# Older locked versions (1.9.x) fail to build on Apple Silicon / macOS 14+.
gem 'ffi', '~> 1.15.5'

group :jekyll_plugins do
	gem 'jekyll-sitemap'
	gem 'jekyll-seo-tag'
	gem 'jekyll-feed'
end

# Support for Ruby < 2.2.2 & activesupport
gem "activesupport", "~> 4.2" if RUBY_VERSION < "2.2.2"
