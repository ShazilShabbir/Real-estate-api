import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function testUpload() {
  console.log('Testing Cloudinary upload with config:', {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: '***' + (process.env.CLOUDINARY_API_SECRET?.slice(-4) || ''),
  });

  try {
    // Try to upload a placeholder image URL or a local file if one exists
    // Using a remote URL is easier for a quick test
    console.log('Attempting upload of a test image...');
    const result = await cloudinary.uploader.upload('https://via.placeholder.com/150', {
      folder: 'real-estate/test',
    });
    console.log('Upload successful!');
    console.log('Result URL:', result.secure_url);
  } catch (error) {
    console.error('Upload failed!');
    console.error(error);
  }
}

testUpload();
