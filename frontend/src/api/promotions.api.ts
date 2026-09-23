import apiClient,{requestData}from"./client"; import type{Promotion}from"../types/content.types"; export const promotionsApi={list:()=>requestData<Promotion[]>(apiClient.get("/promotions"))};
