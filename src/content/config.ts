// src/content/config.ts
import { z, defineCollection } from 'astro:content';

const services = defineCollection({
  schema: z.object({
    title:           z.string(),
    heading:         z.string(),
    about_title:     z.string(),
    about_paragraph: z.string(),
    benefits: z
      .array(z.object({
        icon:  z.string(),
        title: z.string(),
        text:  z.string(),
      }))
      .min(3)
      .max(3),
    faqs: z
      .array(z.object({
        question: z.string(),
        answer:   z.string(),
      }))
      .min(1),
    order:     z.number().default(0),
    published: z.boolean().default(false),
  }),
});

const reviews = defineCollection({
  schema: z.object({
    author: z.string(),
    rating: z.number().min(1).max(5),
    date:   z.string(),
    text:   z.string(),
  }),
});

const cities = defineCollection({
  schema: z.object({
    name:          z.string(),
    page_heading:  z.string(),
    content_title: z.string(),
    image:         z.string(),
    description:   z.string().optional(), 
  }),
});


export const collections = {
  services,
  reviews,
  cities,
};