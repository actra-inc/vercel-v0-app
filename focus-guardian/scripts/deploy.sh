#!/bin/bash

echo "🚀 Starting deployment process..."

# Check if required files exist
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the application
echo "🔨 Building application..."
npm run build

# Check build success
if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
else
    echo "❌ Build failed!"
    exit 1
fi

# Deploy to Vercel
echo "🌐 Deploying to Vercel..."
vercel --prod

echo "🎉 Deployment completed!"
echo "📝 Don't forget to:"
echo "   1. Set environment variables in Vercel Dashboard"
echo "   2. Update Supabase Authentication URLs"
echo "   3. Test the deployed application"
