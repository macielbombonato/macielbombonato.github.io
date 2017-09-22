#!/usr/bin/env bash
set -e

echo "Building bombonato.net"

gem install bundler
bundle install
gem install jekyll
gem install jekyll-sitemap
gem install jekyll-feed
gem install github-pages

bundle exec jekyll build

echo "Finished"
