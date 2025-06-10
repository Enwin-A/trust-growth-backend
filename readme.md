## Documentation.

# Sources:
VOLV-B:
1. https://www.volvogroup.com/content/dam/volvo-group/markets/master/investors/corporate-governance/corporate-governance-report-2024.pdf
2. https://www.volvogroup.com/en/about-us/strategy.html , here I was unable to make it dynamic.
3. https://www.volvogroup.com/en/news-and-media.html, url for news and media coverage
4. https://www.google.com/finance/quote/VOLV-B:STO, stock info for trust and growth is dynamic, api can be edited with the stock name {VOLV-B}

HM-B:
1. https://hmgroup.com/wp-content/uploads/2025/03/HM-Group-Corporate-governance-report-2024.pdf
2. https://hmgroup.com/wp-content/uploads/2025/03/HM-Group-Annual-and-sustainability-report-2024.pdf
3. https://hmgroup.com/media/news/, url for news and media coverage
4. https://www.google.com/finance/quote/HM-B:STO, stock info for trust and growth is dynamic, api can be edited with the stock name {HM-B} 

# Workflow:
User-> selects company-> uploads relevant PDFs regarding company-> clicks "Run Analysis" -> Wait -> Output

# Results:
VOLV-B: Runtime 35s, For VOLV-B: Trust=41, Growth=53. 
HM-B: Runtime 2m24s, For HM-B: Trust=55/100, Growth=25/100.

Assumption: Assuming the LLM has managed to cover all the key points, I unfortunately do not have alot of business knowledge to validate the output and can only understand it at a highlevel.


Note: I have neither optimized the runtimes, nor have I optimzed the LLM Costs, I had built the MVP with a clear agenda of shipping it with the requirements mentioned in the quickest time, including:
1. Caching the firecrawl API(in memory caching instead of file based caching, here it keeps it for x amount of time or until server restarts).
2. Historic Reports, within the logs as it acts as a log file as well as a report which shows the full chain-of-thought approach for the LLM.
3. Exports to JSON for sharing and processing or further usecases.

url: https://trust-growth-backend.onrender.com/
