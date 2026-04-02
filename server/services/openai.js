import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateDesign(prompt, color, garmentType) {
  const fullPrompt = buildPrompt(prompt, color, garmentType);

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: fullPrompt,
    n: 1,
    size: '1024x1024',
  });

  const imageUrl = response.data?.[0]?.url;

  if (!imageUrl) {
    throw new Error('No image returned from OpenAI');
  }

  return imageUrl;
}

function buildPrompt(prompt, color, garmentType) {
  let parts = [prompt];

  if (garmentType) {
    parts.push(`Design intended for a ${garmentType}.`);
  }

  if (color) {
    parts.push(`The garment color is ${color}.`);
  }

  parts.push('Create a clean, print-ready design with transparent background suitable for screen printing or DTG printing.');

  return parts.join(' ');
}
