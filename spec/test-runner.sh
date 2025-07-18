#!/bin/bash

# spec/run-tests.sh
# Test runner script for the blockchain indexer

echo "🚀 Starting Blockchain Indexer Tests..."

# Start the services
echo "📦 Starting Docker services..."
docker-compose up -d --build

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Health check
echo "🔍 Checking if API is responsive..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:3000/ > /dev/null; then
        echo "✅ API is ready!"
        break
    fi
    
    attempt=$((attempt + 1))
    echo "⏳ Attempt $attempt/$max_attempts - waiting for API..."
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ API failed to start within timeout period"
    docker-compose logs
    exit 1
fi

# Run tests
echo "🧪 Running tests..."
if bun test; then
    echo "✅ All tests passed!"
else
    echo "❌ Some tests failed!"
    exit 1
fi

# Cleanup
echo "🧹 Cleaning up..."
docker-compose down

echo "🎉 Test run completed!"