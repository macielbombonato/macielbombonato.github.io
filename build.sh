#!/usr/bin/env bash
set -e

echo "Building bombonato.net"

gem install bundler:1.15.4
bundle install
bundle exec jekyll build

echo "Finished"
