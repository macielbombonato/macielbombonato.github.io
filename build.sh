#!/usr/bin/env bash
set -e

echo "Building bombonato.net"

bundle update --bundler
bundle install
bundle exec jekyll build

echo "Finished"
