#!/usr/bin/env bash
set -e

echo "Building bombonato.net"

gem install bundler
bundle install
gem install jekyll

bundle exec jekyll build

echo "Finished"
