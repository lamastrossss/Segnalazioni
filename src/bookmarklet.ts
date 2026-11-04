/** Codice del pulsante "Revisiona" da trascinare nei preferiti. */
export function buildBookmarklet(baseUrl: string): string {
  const src = baseUrl.replace(/\/?$/, '/') + 'tool.js';
  return "javascript:(()=>{var w=window;if(w.__stageReview){w.__stageReview.destroy();return}"
    + "if(w.__stageReviewLoading)return;w.__stageReviewLoading=true;"
    + "var s=document.createElement('script');s.src='" + src + "?v='+Date.now();"
    + "s.onerror=function(){w.__stageReviewLoading=false;alert('Stage Review: questo sito blocca il tool.')};"
    + "document.documentElement.appendChild(s)})()";
}
