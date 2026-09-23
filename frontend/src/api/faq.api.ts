import apiClient,{requestData}from"./client"; import type{FaqItem}from"../types/content.types"; export const faqApi={list:()=>requestData<FaqItem[]>(apiClient.get("/faqs"))};
