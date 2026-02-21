import requests
from bs4 import BeautifulSoup
import time
from scholarly import scholarly

# 普通关键词搜索函数
def google_scholar_search(query, num_results=5):
    """
    Function to search Google Scholar using a simple keyword query.
    
    Parameters:
    query (str): The search query (e.g., paper title or author).
    num_results (int): The number of results to retrieve.
    
    Returns:
    list: A list of dictionaries containing search results.
    """
    # Prepare the search URL
    search_url = f"https://scholar.google.com/scholar?q={query.replace(' ', '+')}"
    
    # Set up headers to mimic a real browser request
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }

    # Send the GET request to Google Scholar
    response = requests.get(search_url, headers=headers)
    
    # Check if the request was successful
    if response.status_code != 200:
        print(f"Failed to fetch data. HTTP Status code: {response.status_code}")
        return []

    # Parse the HTML content using BeautifulSoup
    soup = BeautifulSoup(response.text, 'html.parser')

    # Find all the articles in the search results
    results = []
    count = 0

    # Find the results on the page
    for item in soup.find_all('div', class_='gs_ri'):
        if count >= num_results:
            break

        title_tag = item.find('h3', class_='gs_rt')
        title = title_tag.get_text() if title_tag else 'No title available'

        link = title_tag.find('a')['href'] if title_tag and title_tag.find('a') else 'No link available'

        authors_tag = item.find('div', class_='gs_a')
        authors = authors_tag.get_text() if authors_tag else 'No authors available'

        abstract_tag = item.find('div', class_='gs_rs')
        abstract = abstract_tag.get_text() if abstract_tag else 'No abstract available'

        result_data = {
            'Title': title,
            'Authors': authors,
            'Abstract': abstract,
            'URL': link
        }
        results.append(result_data)
        count += 1

    return results

# 高级搜索函数
def advanced_google_scholar_search(query, author=None, year_range=None, num_results=5):
    """
    Function to search Google Scholar using advanced search filters (e.g., author, year range).
    
    Parameters:
    query (str): The search query (e.g., paper title or topic).
    author (str): The author's name to filter the results (default is None).
    year_range (tuple): A tuple (start_year, end_year) to filter the results by publication year (default is None).
    num_results (int): The number of results to retrieve.
    
    Returns:
    list: A list of dictionaries containing search results.
    """
    # Prepare the advanced search URL
    search_url = "https://scholar.google.com/scholar?"
    
    # Build the search query
    search_params = {'q': query.replace(' ', '+')}
    if author:
        search_params['as_auth'] = author
    if year_range:
        start_year, end_year = year_range
        search_params['as_ylo'] = start_year  # Start year
        search_params['as_yhi'] = end_year  # End year
    
    # Encode the search parameters into the URL
    search_url += '&'.join([f"{key}={value}" for key, value in search_params.items()])

    # Set up headers to mimic a real browser request
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }

    # Send the GET request to Google Scholar
    response = requests.get(search_url, headers=headers)
    
    # Check if the request was successful
    if response.status_code != 200:
        print(f"Failed to fetch data. HTTP Status code: {response.status_code}")
        return []

    # Parse the HTML content using BeautifulSoup
    soup = BeautifulSoup(response.text, 'html.parser')

    # Find all the articles in the search results
    results = []
    count = 0

    # Find the results on the page
    for item in soup.find_all('div', class_='gs_ri'):
        if count >= num_results:
            break

        title_tag = item.find('h3', class_='gs_rt')
        title = title_tag.get_text() if title_tag else 'No title available'

        link = title_tag.find('a')['href'] if title_tag and title_tag.find('a') else 'No link available'

        authors_tag = item.find('div', class_='gs_a')
        authors = authors_tag.get_text() if authors_tag else 'No authors available'

        abstract_tag = item.find('div', class_='gs_rs')
        abstract = abstract_tag.get_text() if abstract_tag else 'No abstract available'

        result_data = {
            'Title': title,
            'Authors': authors,
            'Abstract': abstract,
            'URL': link
        }
        results.append(result_data)
        count += 1

    return results

# Example usage:
if __name__ == "__main__":
    # 1.普通关键词搜索
    query = "machine learning"
    results = google_scholar_search(query, num_results=5)
    print("Results for keyword search:")
    for result in results:
        print(f"\nTitle: {result['Title']}")
        print(f"Authors: {result['Authors']}")
        print(f"Abstract: {result['Abstract']}")
        print(f"URL: {result['URL']}")
        print("-" * 80)

    # 2.高级搜索
    advanced_query = "machine learning"
    advanced_results = advanced_google_scholar_search(advanced_query, author="Ian Goodfellow", year_range=(2010, 2021), num_results=5)
    print("\nResults for advanced search:")
    for result in advanced_results:
        print(f"\nTitle: {result['Title']}")
        print(f"Authors: {result['Authors']}")
        print(f"Abstract: {result['Abstract']}")
        print(f"URL: {result['URL']}")
        print("-" * 80)


    # Retrieve the author's data, fill-in, and print
    # 3.Get an iterator for the author results
    search_query = scholarly.search_author('Steven A Cholewiak')
    # 4.Retrieve the first result from the iterator
    first_author_result = next(search_query)
    scholarly.pprint(first_author_result)

    # 5.Retrieve all the details for the author
    author = scholarly.fill(first_author_result )
    scholarly.pprint(author)

    # 6.Take a closer look at the first publication
    first_publication = author['publications'][0]
    first_publication_filled = scholarly.fill(first_publication)
    scholarly.pprint(first_publication_filled)

    # 7.Print the titles of the author's publications
    publication_titles = [pub['bib']['title'] for pub in author['publications']]
    print(publication_titles)



