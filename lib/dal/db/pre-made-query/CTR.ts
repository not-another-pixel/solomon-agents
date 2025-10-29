

export const createCTRquery = (company_id: string, startDate: string, endDate: string, limit: number, isHighCTR: boolean) => {
    let CTRquery: string;
    if (isHighCTR) {
        CTRquery = "DESC";
    } else {
        CTRquery = "ASC";
    }

    return `
SELECT 
    ad_name,
    ad_id,
    call_to_action,
    body,
    CONCAT('https://storage.googleapis.com/facebook-ads-media-sources/', '${company_id}', '/', ad_id) AS video_url,
    CONCAT('https://storage.cloud.google.com/facebook-ads-media-sources/', '${company_id}', '/', ad_id) AS auth_video_url,
    SUM(spend) AS spend,
    COALESCE(SUM(video_views*1.0) / NULLIF(SUM(impressions*1.0), 0), 0) AS thumb_stop_rate,
    COALESCE(SUM(link_clicks*1.0) / NULLIF(SUM(impressions*1.0), 0), 0) AS ctr,
    SUM(revenue) AS conversion_value
FROM facebook_ads
WHERE company_id = '${company_id}'
  AND date BETWEEN '${startDate}' AND '${endDate}'
  AND ad_type = 'dynamic'
  AND impressions > 0
  AND image_url LIKE '%https://scontent-sof1-2.xx.fbcdn.net/v/t15%'
GROUP BY
    ad_name,
    ad_id,
    call_to_action,
    body,
    CONCAT('https://storage.googleapis.com/facebook-ads-media-sources/', '${company_id}', '/', ad_id)
HAVING SUM(spend) > 20
ORDER BY
    ctr ${CTRquery}
LIMIT ${limit};
`;
}
